-- A Kindle dialog asking for a number from 1 to `max`, with a number pad under it.
local D = require("lexeme/draw")
local Dialog = require("lexeme/dialog")
local Keyboard = require("lexeme/keyboard")
local View = require("lexeme/view")

local NumberEntry = View:extend{
    title = nil,
    intro = nil,
    legend = nil,
    ok_text = "OK",
    max = nil,
    on_ok = nil,
    background = false,
}

local KEYPAD_TOP = 1193
local KEYPAD_COLS = { 392, 629, 865 }
local KEYPAD_ROWS = { 1270, 1387, 1502, 1617 }
local KEY_W, KEY_H = 232, 116 -- Amazon's keypad keys

function NumberEntry:init()
    View.init(self)
    self.covers_fullscreen = false
    self.digits = ""
end

function NumberEntry:value()
    local n = tonumber(self.digits)
    if not n or n < 1 or n > self.max then return nil end
    return n
end

function NumberEntry:type(key)
    if key == "back" then
        self.digits = self.digits:sub(1, -2)
    elseif key == "enter" then
        return self:submit()
    elseif #self.digits < #tostring(self.max) then
        self.digits = self.digits .. key
    end
    self:refresh("fast")
end

function NumberEntry:submit()
    local n = self:value()
    if not n then return end
    self:close()
    self.on_ok(n)
end

function NumberEntry:render(bb, x, y, w, h)
    self:hit(x, y, w, h, function() self:close() end)
    local bx, by, bw, bh = x + D.s(100), y + D.s(183), w - D.s(200), D.s(620)
    self:hit(bx, by, bw, bh, function() end)
    Dialog.frame(bb, bx, by, bw, bh)
    D.text(bb, bx + D.s(58), by + D.s(100), D.face("bold", 31), self.title)
    D.text(bb, bx + D.s(58), by + D.s(167), D.face("regular", 32), self.intro, D.BLACK, bw - D.s(116))

    local fx, fy, fw, fh = bx + D.s(58), by + D.s(261), bw - D.s(116), D.s(99)
    D.border(bb, fx, fy, fw, fh, D.s(2))
    local legend_face = D.face("regular", 26)
    local lw = D.width(legend_face, self.legend)
    D.rect(bb, fx + D.s(14), fy - D.s(4), lw + D.s(16), D.s(8), D.WHITE)
    D.text(bb, fx + D.s(22), fy + D.s(9), legend_face, self.legend)
    local tw = D.text(bb, fx + D.s(30), fy + D.s(64), D.face("regular", 34), self.digits)
    D.rect(bb, fx + D.s(32) + tw, fy + D.s(28), D.s(2), D.s(44))

    local button_y = by + bh - D.s(158)
    local valid = self:value() ~= nil
    local ok_x = Dialog.button(self, bb, bx + bw - D.s(58), button_y, self.ok_text, true,
        valid and function() self:submit() end or nil)
    Dialog.button(self, bb, ok_x - D.s(38), button_y, "Cancel", false, function() self:close() end)

    local top = y + h - D.s(1696 - KEYPAD_TOP)
    self:hit(x, top, w, h - (top - y), function() end)
    D.rect(bb, x, top, w, h - (top - y), D.WHITE)
    D.rect(bb, x, top, w, D.s(4))
    local keys = { { "1", "2", "3" }, { "4", "5", "6" }, { "7", "8", "9" }, { "back", "0", "enter" } }
    local face = D.face("regular", 44)
    local kw, kh = D.s(KEY_W), D.s(KEY_H)
    for r, row in ipairs(keys) do
        local cy = top + D.s(KEYPAD_ROWS[r] - KEYPAD_TOP)
        for c, key in ipairs(row) do
            local cx = x + D.s(KEYPAD_COLS[c])
            local kx, ky = cx - math.floor(kw / 2), cy - math.floor(kh / 2)
            if key == "back" then
                Keyboard.paintKeyImage(bb, Keyboard.DELETE, kx, ky, kw, kh)
            elseif key == "enter" then
                Keyboard.paintKeyImage(bb, Keyboard.RETURN, kx, ky, kw, kh)
            else
                D.textCenter(bb, cx, cy + D.s(16), face, key)
            end
            self:hit(kx, ky, kw, kh, function() self:type(key) end, nil, Keyboard.pressedBox(kx, ky, kw, kh))
        end
    end
end

return NumberEntry
