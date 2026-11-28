--[[
Flashing refreshes that KOReader doesn't wait for. After each one it sends, KOReader waits for the
flash to finish on screen (a third to half a second on a Paperwhite 5) before doing anything else,
taps included. Here the refresh before it is still waited for as usual, and the next refresh that
needs to waits for this one, as KOReader's own comment on that wait says it could: the screen looks
the same, and KOReader is free as soon as the flash starts.
]]
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local Flash = {}

-- Calls fn(...), which refreshes the screen, without waiting for the flashes it sends.
function Flash.withoutWaiting(fn, ...)
    local fb = Screen
    local wait = fb.mech_wait_update_complete
    if not wait then return fn(...) end
    local previous = fb.marker
    fb.mech_wait_update_complete = function(this, marker)
        if marker == previous then return wait(this, marker) end
        return 0
    end
    local ok, err = pcall(fn, ...)
    fb.mech_wait_update_complete = wait
    if fb.marker ~= previous then fb.dont_wait_for_marker = nil end
    if not ok then error(err, 0) end
end

-- KOReader's next repaint, without waiting for its flash.
function Flash.nextRepaint()
    local repaint = rawget(UIManager, "_repaint")
    UIManager._repaint = function(um, ...)
        UIManager._repaint = repaint
        Flash.withoutWaiting(um._repaint, um, ...)
    end
end

return Flash
