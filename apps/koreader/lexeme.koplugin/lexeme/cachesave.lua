--[[
Writes a book's crengine cache while it's being read, so putting the book down has little or
nothing left to write: a long book laid out for the first time took seconds to close on a Kindle
(Virginia Woolf's complete works: 5.7 s), all of it writing the cache.

crengine writes it in slices of at most SLICE_MS, each going on where the last one stopped (or
starting over if the book was laid out again since), and marks the file complete only once the
last slice is written: a book closed or a Kindle switched off before that is laid out again next
time, as it was before. Slices run only once the reader has been left alone for IDLE seconds,
with a pause between them so a tap gets through. Laying the book out again (a font change) makes
the cache stale, and the slices start again. While KOReader re-lays a book out in the background
(its partial rerendering after a font change, the book then reloaded from the cache that work
writes), that work owns the cache file: the slices stop, and start over with the reloaded book.

An engine without doc:updateCache leaves the whole write to the close, as before.
]]
local UIManager = require("ui/uimanager")
local time = require("ui/time")

local SLICE_MS = 80
local IDLE = time.s(2)
local PAUSE = 0.05

local CacheSave = {}

local engine, rolling, last_input, step

local function onInput()
    last_input = UIManager:getTime()
end

function CacheSave.stop()
    if step then UIManager:unschedule(step) end
    if engine then UIManager.event_hook:unregister("InputEvent", onInput) end
    engine, rolling, last_input, step = nil, nil, nil, nil
end

function CacheSave.start(ui)
    CacheSave.stop()
    local doc = ui.rolling and ui.document and ui.document._document
    if not (doc and doc.updateCache) then return end
    engine, rolling = doc, ui.rolling
    last_input = UIManager:getTime()
    UIManager.event_hook:register("InputEvent", onInput)
    step = function()
        if rolling.rendering_state then
            CacheSave.stop()
            return
        end
        local wait = IDLE - (UIManager:getTime() - last_input)
        if wait > 0 then
            UIManager:scheduleIn(time.to_s(wait), step)
            return
        end
        local ok, done = pcall(engine.updateCache, engine, SLICE_MS)
        if not ok or done then
            CacheSave.stop()
            return
        end
        UIManager:scheduleIn(PAUSE, step)
    end
    UIManager:scheduleIn(time.to_s(IDLE), step)
end

return CacheSave
