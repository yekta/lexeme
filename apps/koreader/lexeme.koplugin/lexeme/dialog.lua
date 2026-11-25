-- The centred Kindle dialog: bold title, message, Cancel (unless `cancel_text` is false) and a primary button.
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

-- Measured off Amazon's own dialogs (Restart Your Kindle?), in reference pixels.
local WIDTH, PAD = 936, 68
local TITLE_BASELINE, MESSAGE_BASELINE, LINE_PITCH = 98, 162, 44
local BUTTON_GAP_ABOVE, BUTTON_H, BOTTOM_PAD = 40, 101, 53

function Dialog.frame(bb, x, y, w, h)
    D.rect(bb, x, y, w, h, D.WHITE)
    D.border(bb, x, y, w, h, D.s(3), D.BLACK, D.s(12))
end

-- A Kindle dialog button with its right edge at `right`; secondary buttons turn black while pressed,
-- and a primary one without `on_tap` is greyed out. Returns its left edge.
function Dialog.button(view, bb, right, y, label, primary, on_tap)
    local face = D.face("regular", 32)
    local w, h = math.max(D.s(201), D.width(face, label) + D.s(80)), D.s(BUTTON_H)
    local x = right - w
    local disabled = primary and not on_tap
    local function paint(target, fill)
        local color = D.BLACK
        if fill then
            D.roundRect(target, x, y, w, h, disabled and D.gray(220) or D.BLACK, D.s(6))
            color = disabled and D.gray(136) or D.WHITE
        else
            D.rect(target, x, y, w, h, D.WHITE)
            D.border(target, x, y, w, h, D.s(4), D.BLACK, D.s(6))
        end
        D.textCenter(target, x + w / 2, y + D.s(62), face, label, color)
    end
    paint(bb, primary)
    if on_tap then view:hit(x, y, w, h, on_tap, nil, not primary and function(target) paint(target, true) end) end
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
