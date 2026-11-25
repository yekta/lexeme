-- The centred Kindle dialog: bold title, message, Cancel and a primary button.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local View = require("lexeme/view")

local Dialog = View:extend{
    title = nil,
    message = nil,
    ok_text = "OK",
    cancel_text = "Cancel",
    on_ok = nil,
}

function Dialog:init()
    local w = Screen:getWidth() - D.s(200)
    self.lines = D.wrap(D.face("regular", 32), self.message or "", w - D.s(116), 6)
    local h = D.s(100 + 40) + #self.lines * D.s(44) + D.s(60 + 98 + 60)
    self.region = Geom:new{ x = D.s(100), y = math.floor((Screen:getHeight() - h) / 2), w = w, h = h }
    View.init(self)
end

function Dialog:render(bb, x, y, w, h)
    D.border(bb, x, y, w, h, D.s(3), D.BLACK, D.s(12))
    D.text(bb, x + D.s(58), y + D.s(100), D.face("bold", 30), self.title or "", D.BLACK, w - D.s(116))
    local baseline = y + D.s(150)
    for _, line in ipairs(self.lines) do
        D.text(bb, x + D.s(58), baseline, D.face("regular", 32), line)
        baseline = baseline + D.s(44)
    end
    local bh, by = D.s(98), y + h - D.s(60 + 98)
    local ok_w = math.max(D.s(213), D.width(D.face("regular", 32), self.ok_text) + D.s(80))
    local ok_x = x + w - D.s(58) - ok_w
    D.roundRect(bb, ok_x, by, ok_w, bh, D.BLACK, D.s(8))
    D.textCenter(bb, ok_x + ok_w / 2, by + D.s(61), D.face("regular", 32), self.ok_text, D.WHITE)
    self:pressable(ok_x, by, ok_w, bh, function()
        self:close()
        if self.on_ok then UIManager:nextTick(self.on_ok) end
    end, { radius = D.s(8) },
        { x = ok_x + D.s(3), y = by + D.s(3), w = ok_w - D.s(6), h = bh - D.s(6), radius = D.s(5) })
    local cancel_w = math.max(D.s(213), D.width(D.face("regular", 32), self.cancel_text) + D.s(80))
    local cancel_x = ok_x - D.s(24) - cancel_w
    D.border(bb, cancel_x, by, cancel_w, bh, D.s(3), D.BLACK, D.s(8))
    D.textCenter(bb, cancel_x + cancel_w / 2, by + D.s(61), D.face("regular", 32), self.cancel_text)
    self:pressable(cancel_x, by, cancel_w, bh, function() self:close() end,
        D.inset(cancel_x, by, cancel_w, bh, D.s(3), { radius = D.s(5) }))
end

return Dialog
