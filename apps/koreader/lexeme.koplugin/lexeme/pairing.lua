--[[
Connects the Kindle to a Lexeme account: shows a code and a QR code for the
approve page, and polls until the account owner approves it there. The server
then hands this device its own API key.
]]
local UIManager = require("ui/uimanager")
local qrencode = require("ffi/qrencode")

local Api = require("lexeme/api")
local Background = require("lexeme/background")
local D = require("lexeme/draw")
local Status = require("lexeme/status")
local View = require("lexeme/view")

local Pairing = View:extend{
    -- Called with the account's name once the device is connected.
    on_connected = nil,
    state = "starting", -- "starting", "waiting", "expired", "failed"
}

function Pairing:init()
    View.init(self)
    self:start()
end

function Pairing:start()
    self.state = "starting"
    self:refresh()
    Background.run(function() self:request() end, "pairing")
end

function Pairing:request()
    local ok, body = Api.post("/api/devices/pair", { device_name = Status.deviceName() }, false)
    if self.state == "closed" then return end
    if not ok then
        self.state, self.error = "failed", body
        return self:refresh()
    end
    self.code, self.poll_token, self.url = body.user_code, body.poll_token, body.approve_url
    self.interval = body.poll_interval_seconds or 5
    local qr_ok, grid = qrencode.qrcode(self.url)
    self.grid = qr_ok and grid or nil
    self.state = "waiting"
    self:refresh()
    self:schedulePoll()
end

function Pairing:schedulePoll()
    self.poll = function() Background.run(function() self:check() end, "pairing") end
    UIManager:scheduleIn(self.interval, self.poll)
end

function Pairing:check()
    if self.state ~= "waiting" then return end
    local ok, body = Api.post("/api/devices/pair/poll", { poll_token = self.poll_token }, false)
    if self.state ~= "waiting" then return end
    if not ok then return self:schedulePoll() end
    if body.status == "pending" then return self:schedulePoll() end
    if body.status == "expired" then
        self.state = "expired"
        return self:refresh()
    end
    G_reader_settings:saveSetting("lexeme_token", body.token)
    G_reader_settings:saveSetting("lexeme_user_name", body.user_name)
    require("lexeme/sync").fetchAccount()
    G_reader_settings:flush()
    self:close("flashui")
    if self.on_connected then self.on_connected(body.user_name) end
end

function Pairing:onCloseWidget()
    if self.poll then UIManager:unschedule(self.poll) end
    self.state = "closed"
end

function Pairing:paintQr(bb, cx, top, size)
    local cells = #self.grid
    local cell = math.floor(size / (cells + 8))
    local side = cell * cells
    local x0, y0 = cx - math.floor(side / 2), top + math.floor((size - side) / 2)
    D.rect(bb, x0 - 4 * cell, y0 - 4 * cell, side + 8 * cell, side + 8 * cell, D.WHITE)
    for x, column in ipairs(self.grid) do
        for y, value in ipairs(column) do
            if value > 0 then D.rect(bb, x0 + (x - 1) * cell, y0 + (y - 1) * cell, cell, cell) end
        end
    end
end

function Pairing:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w)
    D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
    self:pressable(x, y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(7), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    D.text(bb, x + D.s(139), y + D.s(168), D.face("bold", 34), "Connect to Lexeme")
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))

    local cx = x + math.floor(w / 2)
    local body = D.face("regular", 32)
    if self.state == "starting" then
        D.textCenter(bb, cx, y + D.s(700), body, "Getting a code…")
        return
    end
    if self.state == "failed" then
        D.textCenter(bb, cx, y + D.s(640), D.face("bold", 36), "Couldn't reach Lexeme")
        D.textCenter(bb, cx, y + D.s(700), body, "Check your Wi-Fi connection and try again.", D.BLACK, w - D.s(160))
        self:button(bb, cx, y + D.s(820), "Try again", function() self:start() end)
        return
    end

    local lines = {
        "Scan the code with your phone, or go to",
        "lexeme.fyi/pair and enter the code below.",
    }
    for i, line in ipairs(lines) do
        D.textCenter(bb, cx, y + D.s(320) + (i - 1) * D.s(46), body, line)
    end
    if self.grid then self:paintQr(bb, cx, y + D.s(400), D.s(560)) end
    D.textCenter(bb, cx, y + D.s(1090), D.face("bold", 72), self.code)
    if self.state == "expired" then
        D.textCenter(bb, cx, y + D.s(1190), body, "This code has expired.")
        self:button(bb, cx, y + D.s(1300), "Get a new code", function() self:start() end)
    else
        D.textCenter(bb, cx, y + D.s(1190), body, "Waiting for you to approve this Kindle…", D.gray(102))
    end
end

function Pairing:button(bb, cx, cy, label, on_tap)
    local face = D.face("bold", 32)
    local bw = D.width(face, label) + D.s(120)
    local bh = D.s(96)
    local bx = cx - math.floor(bw / 2)
    D.border(bb, bx, cy - math.floor(bh / 2), bw, bh, D.s(3), D.BLACK, D.s(12))
    D.textCenter(bb, cx, cy + D.s(11), face, label)
    self:pressable(bx, cy - math.floor(bh / 2), bw, bh, on_tap,
        D.inset(bx, cy - math.floor(bh / 2), bw, bh, D.s(3), { radius = D.s(9) }))
end

return Pairing
