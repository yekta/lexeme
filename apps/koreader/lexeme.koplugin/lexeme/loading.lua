-- The Kindle's loading screen: white, with a spinner turning in the middle, while a book opens.
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Spinner = require("lexeme/spinner")
local View = require("lexeme/view")

local Loading = View:extend{}

local SIZE = 70
local current

function Loading:spinnerBox()
    local size = D.s(SIZE)
    return math.floor((Screen:getWidth() - size) / 2), math.floor((Screen:getHeight() - size) / 2), size
end

function Loading:render(bb)
    local x, y, size = self:spinnerBox()
    D.icon(bb, "spinner", x, y, size, size)
end

-- Shows it now, before whatever blocks next; closes itself if nothing does within `timeout` seconds.
function Loading.show(timeout)
    Loading.close()
    current = Loading:new{}
    UIManager:show(current, "flashui")
    UIManager:forceRePaint()
    Spinner.start(current:spinnerBox())
    local shown = current
    UIManager:scheduleIn(timeout or 20, function()
        if current == shown then Loading.close() end
    end)
end

function Loading.close()
    Spinner.stop()
    if not current then return end
    UIManager:close(current)
    current = nil
end

return Loading
