-- A short message at the bottom of the screen that goes away by itself.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local View = require("lexeme/view")

local Toast = View:extend{
    text = nil,
    takes_all_taps = false,
    background = false,
}

function Toast:init()
    self.face = D.face("medium", 32)
    local w = D.width(self.face, self.text) + D.s(96)
    local h = D.s(96)
    self.region = Geom:new{
        x = math.floor((Screen:getWidth() - w) / 2),
        y = Screen:getHeight() - D.s(260),
        w = w,
        h = h,
    }
    View.init(self)
end

function Toast:render(bb, x, y, w, h)
    D.roundRect(bb, x, y, w, h, D.BLACK, D.s(48))
    D.text(bb, x + D.s(48), y + D.s(60), self.face, self.text, D.WHITE)
end

function Toast.show(text)
    local toast = Toast:new{ text = text }
    UIManager:show(toast, "ui")
    UIManager:scheduleIn(2, function() UIManager:close(toast, "ui", toast.dimen) end)
end

return Toast
