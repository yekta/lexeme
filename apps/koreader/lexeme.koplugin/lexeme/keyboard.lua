--[[
The Kindle keyboard, painted at the bottom of a view. The view owns the text;
the keyboard reports keys through `on_input(text)`, `on_backspace()` and
`on_enter()`, and shows `suggestions()` in the bar above the keys.
]]
local Screen = require("device").screen

local D = require("lexeme/draw")

local Keyboard = {}
Keyboard.__index = Keyboard

local TOP = 1112 -- reference y of the keyboard's top border
Keyboard.HEIGHT = 1696 - TOP

-- x0 is where the first key's letter is centred; left and box_pitch place the pressed outlines.
local LETTERS = {
    { keys = "qwertyuiop", x0 = 97, left = 46, box_pitch = 1066 / 9 },
    { keys = "asdfghjkl", x0 = 156, left = 104, box_pitch = 118.5 },
    { keys = "zxcvbnm", x0 = 275, left = 223, box_pitch = 710 / 6 },
}
local SYMBOLS = {
    { keys = "1234567890", x0 = 97, left = 46, box_pitch = 1066 / 9 },
    { keys = "-/:;()&@\"", x0 = 156, left = 104, box_pitch = 118.5 },
    { keys = ".,?!'#%", x0 = 275, left = 223, box_pitch = 710 / 6 },
}
local PITCH = 118.5
local ROW_Y = { 1278, 1392, 1505, 1621 }
-- A pressed key is outlined: the outline's top in each row, its height and thickness.
local KEY_TOP = { 1220, 1336, 1453, 1569 }
local KEY_H, KEY_OUTLINE = 104, 4

function Keyboard.new(opts)
    return setmetatable({
        on_input = opts.on_input,
        on_backspace = opts.on_backspace,
        on_enter = opts.on_enter,
        suggestions = opts.suggestions,
        shift = false,
        symbols = false,
        first_suggestion = 1,
    }, Keyboard)
end

function Keyboard.top()
    return Screen:getHeight() - D.s(Keyboard.HEIGHT)
end

function Keyboard:paint(view, bb, x, w)
    local top = Keyboard.top()
    local function ry(ref) return top + D.s(ref - TOP) end
    D.rect(bb, x, top, w, D.s(Keyboard.HEIGHT), D.WHITE)
    D.rect(bb, x, top, w, D.s(5))
    self:paintSuggestions(view, bb, x, w, ry)
    D.rect(bb, x, ry(1197), w, D.s(2))

    local function key(row, left, key_w)
        return { x = x + D.s(left), y = ry(KEY_TOP[row]), w = D.s(key_w), h = D.s(KEY_H), outline = D.s(KEY_OUTLINE) }
    end

    local face = D.face("regular", 42)
    local rows = self.symbols and SYMBOLS or LETTERS
    for r, row in ipairs(rows) do
        local cy = ry(ROW_Y[r])
        for i = 1, #row.keys do
            local char = row.keys:sub(i, i)
            if self.shift and not self.symbols then char = char:upper() end
            local cx = x + D.s(row.x0 + (i - 1) * PITCH)
            D.textCenter(bb, cx, cy + D.s(14), face, char)
            view:pressable(cx - D.s(PITCH / 2), cy - D.s(57), D.s(PITCH), D.s(114), function()
                self.on_input(char)
                if self.shift then
                    self.shift = false
                    view:refresh()
                end
            end, key(r, math.floor(row.left + (i - 1) * row.box_pitch + 0.5), 106))
        end
    end

    local cy3, cy4 = ry(ROW_Y[3]), ry(ROW_Y[4])
    if not self.symbols then
        D.icon(bb, "arrow-big-up", x + D.s(98), cy3 - D.s(30), D.s(60), D.s(60))
        if self.shift then D.rect(bb, x + D.s(103), cy3 + D.s(34), D.s(50), D.s(4)) end
        view:pressable(x, cy3 - D.s(57), D.s(200), D.s(114), function()
            self.shift = not self.shift
            view:refresh()
        end, key(3, 46, 165))
    end
    D.icon(bb, "delete", x + D.s(1101), cy3 - D.s(33), D.s(66), D.s(66))
    view:pressable(x + D.s(1050), cy3 - D.s(57), w - D.s(1050), D.s(114), function() self.on_backspace() end,
        key(3, 1052, 166))

    D.textCenter(bb, x + D.s(129), cy4 + D.s(14), D.face("regular", 40), self.symbols and "ABC" or "123")
    view:pressable(x, cy4 - D.s(57), D.s(200), D.s(114), function()
        self.symbols = not self.symbols
        view:refresh()
    end, key(4, 46, 165))
    D.border(bb, x + D.s(223), cy4 - D.s(24), D.s(698), D.s(49), D.s(2))
    D.textCenter(bb, x + D.s(572), cy4 + D.s(9), D.face("bold", 22), "SPACE")
    view:pressable(x + D.s(210), cy4 - D.s(57), D.s(724), D.s(114), function() self.on_input(" ") end,
        { x = x + D.s(221), y = ry(1595), w = D.s(702), h = D.s(52), outline = D.s(KEY_OUTLINE) })
    D.textCenter(bb, x + D.s(985), cy4 + D.s(14), face, ".")
    view:pressable(x + D.s(934), cy4 - D.s(57), D.s(110), D.s(114), function() self.on_input(".") end,
        key(4, 933, 106))
    D.icon(bb, "corner-down-left", x + D.s(1100), cy4 - D.s(36), D.s(72), D.s(72))
    view:pressable(x + D.s(1050), cy4 - D.s(57), w - D.s(1050), D.s(114), function() self.on_enter() end,
        key(4, 1052, 166))
end

function Keyboard:paintSuggestions(view, bb, x, w, ry)
    local words = self.suggestions and self.suggestions() or {}
    local cy = ry(1157)
    local face = D.face("regular", 40)
    local more_left = self.first_suggestion > 1
    D.icon(bb, more_left and "chevron-left" or "chevron-left-gray", x + D.s(14), cy - D.s(25), D.s(50), D.s(50))
    D.rect(bb, x + D.s(79), ry(1123), D.s(2), D.s(70))
    D.rect(bb, x + w - D.s(81), ry(1123), D.s(2), D.s(70))
    if more_left then
        view:hit(x, ry(1117), D.s(80), D.s(80), function()
            self.first_suggestion = math.max(1, self.first_suggestion - 4)
            view:refresh()
        end)
    end
    local wx, last = x + D.s(109), self.first_suggestion - 1
    for i = self.first_suggestion, #words do
        local ww = D.width(face, words[i])
        if wx + ww > x + w - D.s(100) then break end
        D.text(bb, wx, cy + D.s(14), face, words[i])
        local word = words[i]
        view:hit(wx - D.s(25), ry(1117), ww + D.s(50), D.s(80), function() self.on_input(word, true) end)
        wx = wx + ww + D.s(57)
        last = i
    end
    local more_right = last < #words
    D.icon(bb, more_right and "chevron-right" or "chevron-right-gray", x + w - D.s(66), cy - D.s(25), D.s(50), D.s(50))
    if more_right then
        view:hit(x + w - D.s(80), ry(1117), D.s(80), D.s(80), function()
            self.first_suggestion = last + 1
            view:refresh()
        end)
    end
end

return Keyboard
