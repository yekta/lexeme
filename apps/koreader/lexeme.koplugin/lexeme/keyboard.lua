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

-- On a Paperwhite 5 (1236 x 1648) Amazon's keyboard isn't the Paperwhite 12's scaled down: measured
-- off it, in its pixels. Letters are 46 px, each row's baseline 114 px under the last.
local PW5 = {
    rows = {
        { x0 = 96.5, pitch = 115.78, baseline = 1247, box_top = 1180 },
        { x0 = 154, pitch = 115.75, baseline = 1362, box_top = 1294 },
        { x0 = 270.5, pitch = 115.67, baseline = 1476, box_top = 1408 },
        { baseline = 1590, box_top = 1522 },
    },
    letter_px = 46, box_w = 104, box_h = 102,
    bar_rule = 1160, word_baseline = 1136,
    shift = { 124.5, 1460.5 }, delete = { 1108.5, 1459.5 }, enter = { 1108.5, 1574 },
    symbols_label = 126, dot = 964.5,
    space = { x = 218, y = 1551, w = 684, h = 47, label_x = 559.5, label_baseline = 1583 },
}

local function pw5()
    return Screen:getWidth() == 1236 and Screen:getHeight() == 1648
end

local KINDLE_KEYS = "/usr/share/keyboard/images/"
Keyboard.DELETE = { file = "keyDeleteEnabled.png", w = 66, h = 37, icon = "delete" }
Keyboard.RETURN = { file = "keyReturnEnabled.png", w = 56, h = 48, icon = "corner-down-left" }
local SHIFT = { file = "keyShiftEnabled.png", w = 52, h = 48, icon = "arrow-big-up" }
local SHIFT_ON = { file = "keyShiftLockEnabled.png", w = 43, h = 43, icon = "arrow-big-up" }

-- Draws one of Amazon's key images centred in `area`, or a look-alike icon off a Kindle.
function Keyboard.paintKeyImage(bb, key, area)
    if D.kindleImage(bb, KINDLE_KEYS .. key.file, key.w, key.h, area.x, area.y, area.w, area.h) then return end
    local size = D.s(60)
    D.icon(bb, key.icon, area.x + math.floor((area.w - size) / 2), area.y + math.floor((area.h - size) / 2), size, size)
end

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
    if pw5() then return self:paintPW5(view, bb, x, w) end
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
        local shift = key(3, 46, 165)
        Keyboard.paintKeyImage(bb, self.shift and SHIFT_ON or SHIFT, shift)
        view:pressable(x, cy3 - D.s(57), D.s(200), D.s(114), function()
            self.shift = not self.shift
            view:refresh()
        end, shift)
    end
    local delete = key(3, 1052, 166)
    Keyboard.paintKeyImage(bb, Keyboard.DELETE, delete)
    view:pressable(x + D.s(1050), cy3 - D.s(57), w - D.s(1050), D.s(114), function() self.on_backspace() end,
        delete)

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
    local enter = key(4, 1052, 166)
    Keyboard.paintKeyImage(bb, Keyboard.RETURN, enter)
    view:pressable(x + D.s(1050), cy4 - D.s(57), w - D.s(1050), D.s(114), function() self.on_enter() end,
        enter)
end

-- The keyboard as Amazon's is on a Paperwhite 5, from PW5 above.
function Keyboard:paintPW5(view, bb, x, w)
    local h = Screen:getHeight()
    local top = Keyboard.top()
    D.rect(bb, x, top, w, h - top, D.WHITE)
    D.rect(bb, x, top, w, D.s(5))
    self:paintSuggestions(view, bb, x, w, function(ref) return top + D.s(ref - TOP) end, PW5)
    D.rect(bb, x, PW5.bar_rule, w, 2)

    local face = D.faceAt("regular", PW5.letter_px)
    local rows = self.symbols and SYMBOLS or LETTERS
    local function box(cx, row, bw)
        bw = bw or PW5.box_w
        return { x = math.floor(cx - bw / 2 + 1.5), y = PW5.rows[row].box_top, w = bw, h = PW5.box_h, outline = 4 }
    end
    for r, row in ipairs(rows) do
        local g = PW5.rows[r]
        for i = 1, #row.keys do
            local char = row.keys:sub(i, i)
            if self.shift and not self.symbols then char = char:upper() end
            local cx = x + g.x0 + (i - 1) * g.pitch
            D.textCenter(bb, cx, g.baseline, face, char)
            view:pressable(math.floor(cx - g.pitch / 2), g.box_top - 6, math.floor(g.pitch), 114, function()
                self.on_input(char)
                if self.shift then
                    self.shift = false
                    view:refresh()
                end
            end, box(cx, r))
        end
    end

    local function centred(point, bw, bh)
        return { x = x + math.floor(point[1] - bw / 2 + 0.5), y = math.floor(point[2] - bh / 2 + 0.5), w = bw, h = bh }
    end
    if not self.symbols then
        local shift = centred(PW5.shift, 60, 60)
        Keyboard.paintKeyImage(bb, self.shift and SHIFT_ON or SHIFT, shift)
        view:pressable(x, PW5.rows[3].box_top - 6, 200, 114, function()
            self.shift = not self.shift
            view:refresh()
        end, box(PW5.shift[1], 3, 165))
    end
    Keyboard.paintKeyImage(bb, Keyboard.DELETE, centred(PW5.delete, 70, 40))
    view:pressable(x + w - 186, PW5.rows[3].box_top - 6, 186, 114, function() self.on_backspace() end,
        box(PW5.delete[1], 3, 165))

    D.textCenter(bb, x + PW5.symbols_label, PW5.rows[4].baseline, face, self.symbols and "ABC" or "123")
    view:pressable(x, PW5.rows[4].box_top - 6, 200, 114, function()
        self.symbols = not self.symbols
        view:refresh()
    end, box(PW5.symbols_label, 4, 165))
    local sp = PW5.space
    D.border(bb, x + sp.x, sp.y, sp.w, sp.h, 1)
    D.textCenter(bb, x + sp.label_x, sp.label_baseline, D.faceAt("bold", 24), "SPACE")
    view:pressable(x + sp.x - 10, PW5.rows[4].box_top - 6, sp.w + 20, 114, function() self.on_input(" ") end,
        { x = x + sp.x - 2, y = sp.y - 2, w = sp.w + 4, h = sp.h + 4, outline = 4 })
    D.textCenter(bb, x + PW5.dot, PW5.rows[4].baseline, face, ".")
    view:pressable(x + PW5.dot - 55, PW5.rows[4].box_top - 6, 110, 114, function() self.on_input(".") end,
        box(PW5.dot, 4))
    Keyboard.paintKeyImage(bb, Keyboard.RETURN, centred(PW5.enter, 60, 50))
    view:pressable(x + w - 186, PW5.rows[4].box_top - 6, 186, 114, function() self.on_enter() end,
        box(PW5.enter[1], 4, 165))
end

function Keyboard:paintSuggestions(view, bb, x, w, ry, pw5_geometry)
    local words = self.suggestions and self.suggestions() or {}
    -- With nothing to suggest, the Kindle leaves the bar empty.
    if #words == 0 then return end
    -- Where things sit: on a Paperwhite 5 as measured off its keyboard (46 px words on a baseline at
    -- 1136, dividers at 78 and 80 px from the right), elsewhere the Paperwhite 12's scaled.
    local g = pw5_geometry and {
        face = D.faceAt("regular", 46), baseline = 1136, arrow_y = 1095, divider_y = 1090, divider_h = 66,
        left_divider = x + 78, right_divider = x + w - 80, first = x + 102, gap = 48, hit_y = 1086, hit_h = 74,
    } or {
        face = D.face("regular", 40), baseline = ry(1157) + D.s(14), arrow_y = ry(1157) - D.s(25),
        divider_y = ry(1123), divider_h = D.s(70), left_divider = x + D.s(79), right_divider = x + w - D.s(81),
        first = x + D.s(109), gap = D.s(57), hit_y = ry(1117), hit_h = D.s(80),
    }
    local more_left = self.first_suggestion > 1
    D.icon(bb, more_left and "chevron-left" or "chevron-left-gray", x + D.s(14), g.arrow_y, D.s(50), D.s(50))
    D.rect(bb, g.left_divider, g.divider_y, D.s(2), g.divider_h)
    D.rect(bb, g.right_divider, g.divider_y, D.s(2), g.divider_h)
    if more_left then
        view:hit(x, g.hit_y, D.s(80), g.hit_h, function()
            self.first_suggestion = math.max(1, self.first_suggestion - 4)
            view:refresh()
        end)
    end
    local wx, last = g.first, self.first_suggestion - 1
    for i = self.first_suggestion, #words do
        local ww = D.width(g.face, words[i])
        if wx + ww > g.right_divider - D.s(20) then break end
        D.text(bb, wx, g.baseline, g.face, words[i])
        local word = words[i]
        view:hit(wx - D.s(25), g.hit_y, ww + D.s(50), g.hit_h, function() self.on_input(word, true) end)
        wx = wx + ww + g.gap
        last = i
    end
    local more_right = last < #words
    D.icon(bb, more_right and "chevron-right" or "chevron-right-gray", x + w - D.s(66), g.arrow_y, D.s(50), D.s(50))
    if more_right then
        view:hit(x + w - D.s(80), g.hit_y, D.s(80), g.hit_h, function()
            self.first_suggestion = last + 1
            view:refresh()
        end)
    end
end

return Keyboard
