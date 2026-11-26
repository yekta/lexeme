-- A short message at the bottom of the screen that goes away by itself.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Spinner = require("lexeme/spinner")
local View = require("lexeme/view")

local SPINNER, SPINNER_GAP = 44, 20
local MAX_LINES, LINE_HEIGHT = 3, 44

local Toast = View:extend{
    text = nil,
    spinning = false,
    takes_all_taps = false,
    background = false,
}

function Toast:init()
    self.face = D.face("medium", 32)
    self.text_x = self.spinning and D.s(48 + SPINNER + SPINNER_GAP) or D.s(48)
    local max_text_w = Screen:getWidth() - D.s(2 * 60) - self.text_x - D.s(48)
    self.lines = D.wrap(self.face, self.text, max_text_w, MAX_LINES)
    local text_w = 0
    for _, line in ipairs(self.lines) do text_w = math.max(text_w, D.width(self.face, line)) end
    local w = text_w + self.text_x + D.s(48)
    local h = D.s(96 + (#self.lines - 1) * LINE_HEIGHT)
    self.region = Geom:new{
        x = math.floor((Screen:getWidth() - w) / 2),
        y = Screen:getHeight() - D.s(164) - h,
        w = w,
        h = h,
    }
    View.init(self)
end

function Toast:render(bb, x, y, w, h)
    D.roundRect(bb, x, y, w, h, D.WHITE, D.s(48))
    D.border(bb, x, y, w, h, D.s(3), D.BLACK, D.s(48))
    for i, line in ipairs(self.lines) do
        D.text(bb, x + self.text_x, y + D.s(60 + (i - 1) * LINE_HEIGHT), self.face, line, D.BLACK)
    end
    if self.spinning then D.icon(bb, "spinner", self:spinnerBox()) end
end

function Toast:spinnerBox()
    local size = D.s(SPINNER)
    return self.region.x + D.s(48), self.region.y + math.floor((self.region.h - size) / 2), size, size
end

function Toast.show(text)
    local toast = Toast:new{ text = text }
    UIManager:show(toast, "ui")
    UIManager:scheduleIn(2, function() UIManager:close(toast, "ui", toast.dimen) end)
end

-- Stays up with its spinner turning while what comes next blocks; returns a function that closes it.
function Toast.busy(text)
    local toast = Toast:new{ text = text, spinning = true }
    UIManager:show(toast, "ui")
    UIManager:forceRePaint()
    local x, y, size = toast:spinnerBox()
    Spinner.start(x, y, size)
    return function()
        Spinner.stop()
        UIManager:close(toast, "ui", toast.dimen)
    end
end

return Toast
