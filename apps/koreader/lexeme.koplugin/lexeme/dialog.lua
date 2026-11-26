-- The centred Kindle dialog: bold title, message, Cancel (unless `cancel_text` is false) and a primary button.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local Button = require("lexeme/button")
local D = require("lexeme/draw")
local View = require("lexeme/view")

local Dialog = View:extend{
    title = nil,
    message = nil,
    ok_text = "OK",
    cancel_text = "Cancel",
    on_ok = nil,
}

-- Measured off Amazon's own dialogs (Restart Your Kindle?), in reference pixels.
local WIDTH, PAD = 936, 68
local TITLE_BASELINE, MESSAGE_BASELINE, LINE_PITCH = 98, 162, 44
local BUTTON_GAP_ABOVE, BUTTON_H, BOTTOM_PAD = 40, 101, 53

function Dialog.frame(bb, x, y, w, h)
    D.rect(bb, x, y, w, h, D.WHITE)
    D.border(bb, x, y, w, h, D.s(3), D.BLACK, D.s(12))
end

-- A Kindle dialog button with its right edge at `right`, greyed out without `on_tap`.
-- Returns its left edge.
function Dialog.button(view, bb, right, y, label, primary, on_tap)
    local o = { label = label, size = 32, baseline = 62, pad = 80, h = BUTTON_H, border = 4, radius = 6 }
    o.w = math.max(D.s(201), Button.width(o))
    local x = right - o.w
    if not primary then
        Button.paint(view, bb, x, y, o, on_tap)
        return x
    end
    D.roundRect(bb, x, y, o.w, D.s(o.h), on_tap and D.BLACK or D.gray(220), D.s(o.radius))
    D.textCenter(bb, x + o.w / 2, y + D.s(o.baseline), D.face("regular", o.size), label,
        on_tap and D.WHITE or D.gray(136))
    if on_tap then view:pressable(x, y, o.w, D.s(o.h), on_tap, { radius = D.s(o.radius) }) end
    return x
end

function Dialog:init()
    local w = D.s(WIDTH)
    self.lines = D.wrap(D.face("regular", 32), self.message or "", w - D.s(2 * PAD), 6)
    local h = D.s(MESSAGE_BASELINE + (#self.lines - 1) * LINE_PITCH + BUTTON_GAP_ABOVE + BUTTON_H + BOTTOM_PAD)
    self.region = Geom:new{
        x = math.floor((Screen:getWidth() - w) / 2),
        y = math.floor((Screen:getHeight() - h) / 2),
        w = w,
        h = h,
    }
    View.init(self)
end

function Dialog:render(bb, x, y, w, h)
    Dialog.frame(bb, x, y, w, h)
    D.text(bb, x + D.s(PAD), y + D.s(TITLE_BASELINE), D.face("bold", 31), self.title or "", D.BLACK, w - D.s(2 * PAD))
    local baseline = y + D.s(MESSAGE_BASELINE)
    for _, line in ipairs(self.lines) do
        D.text(bb, x + D.s(PAD), baseline, D.face("regular", 32), line)
        baseline = baseline + D.s(LINE_PITCH)
    end
    local by = baseline - D.s(LINE_PITCH) + D.s(BUTTON_GAP_ABOVE)
    local ok_x = Dialog.button(self, bb, x + w - D.s(PAD), by, self.ok_text, true, function()
        self:close()
        if self.on_ok then UIManager:nextTick(self.on_ok) end
    end)
    if not self.cancel_text then return end
    Dialog.button(self, bb, ok_x - D.s(38), by, self.cancel_text, false, function() self:close() end)
end

return Dialog
