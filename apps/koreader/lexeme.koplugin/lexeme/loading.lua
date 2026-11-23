-- The Kindle's loading screen: white, with a spinner in the middle, while a book opens.
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local View = require("lexeme/view")

local Loading = View:extend{}

local current

function Loading:render(bb, x, y, w, h)
    local size = D.s(70)
    D.icon(bb, "spinner", x + math.floor((w - size) / 2), y + math.floor((h - size) / 2), size, size)
end

-- Shows it now, before whatever blocks next; closes itself if nothing does within `timeout` seconds.
function Loading.show(timeout)
    Loading.close()
    current = Loading:new{}
    UIManager:show(current, "flashui")
    UIManager:forceRePaint()
    local shown = current
    UIManager:scheduleIn(timeout or 20, function()
        if current == shown then Loading.close() end
    end)
end

function Loading.close()
    if not current then return end
    UIManager:close(current)
    current = nil
end

return Loading
