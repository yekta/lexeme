-- The reading timer: counts down while the Kindle is awake and says when the time is up.
-- It stops counting while the Kindle sleeps, and while you've paused it.
local UIManager = require("ui/uimanager")

local Dialog = require("lexeme/dialog")

local Timer = {}

local PRESETS = { 10, 15, 25, 30, 45, 60 }
local LAST_USED = "lexeme_reading_timer_minutes"
local CUSTOM = "lexeme_reading_timer_custom"

-- ends_at while counting; paused_left while the Kindle sleeps or you've paused it (`held`).
local minutes, ends_at, paused_left, held

function Timer.label(m)
    if m < 60 then return m == 1 and "1 minute" or m .. " minutes" end
    local hours, rest = math.floor(m / 60), m % 60
    local text = hours == 1 and "1 hour" or hours .. " hours"
    if rest == 0 then return text end
    return text .. " " .. Timer.label(rest)
end

function Timer.shortLabel(m)
    if m < 60 then return m .. " min" end
    if m % 60 == 0 then return m / 60 .. " hr" end
    return math.floor(m / 60) .. " hr " .. m % 60 .. " min"
end

local function finish()
    local read = minutes
    minutes, ends_at, paused_left, held = nil, nil, nil, nil
    Dialog:new{
        title = "Time's Up",
        message = "You've read for " .. Timer.label(read) .. ".",
        cancel_text = false,
    }:show("flashui")
end

function Timer.lastUsed()
    return G_reader_settings:readSetting(LAST_USED) or 15
end

local function customs()
    return G_reader_settings:readSetting(CUSTOM) or {}
end

local function indexOf(list, m)
    for i, value in ipairs(list) do
        if value == m then return i end
    end
end

function Timer.isCustom(m)
    return indexOf(PRESETS, m) == nil
end

-- The last used duration first, then the presets and custom durations, shortest first.
function Timer.choices()
    local last = Timer.lastUsed()
    local rest = {}
    for _, list in ipairs({ PRESETS, customs() }) do
        for _, m in ipairs(list) do
            if m ~= last then table.insert(rest, m) end
        end
    end
    table.sort(rest)
    table.insert(rest, 1, last)
    return rest
end

function Timer.removeCustom(m)
    local list = customs()
    local i = indexOf(list, m)
    if not i then return end
    table.remove(list, i)
    G_reader_settings:saveSetting(CUSTOM, list)
    if Timer.lastUsed() == m then G_reader_settings:delSetting(LAST_USED) end
end

function Timer.start(m)
    Timer.stop()
    G_reader_settings:saveSetting(LAST_USED, m)
    local list = customs()
    if Timer.isCustom(m) and not indexOf(list, m) then
        table.insert(list, m)
        G_reader_settings:saveSetting(CUSTOM, list)
    end
    minutes, ends_at = m, os.time() + m * 60
    UIManager:scheduleIn(m * 60, finish)
end

function Timer.stop()
    UIManager:unschedule(finish)
    minutes, ends_at, paused_left, held = nil, nil, nil, nil
end

-- Whether a timer is set, counting or paused.
function Timer.isRunning()
    return minutes ~= nil
end

function Timer.isPaused()
    return held == true
end

function Timer.minutesLeft()
    if not minutes then return nil end
    local seconds = paused_left or math.max(0, ends_at - os.time())
    return math.max(1, math.ceil(seconds / 60))
end

-- How much of the running timer has passed, from 0 to 1, or nil when none runs.
function Timer.progress()
    if not minutes then return nil end
    local left = paused_left or math.max(0, ends_at - os.time())
    return math.min(1, math.max(0, 1 - left / (minutes * 60)))
end

-- "12 min left", or "Paused · 12 min left" ("Paused · 12 min" when short).
function Timer.statusLabel(short)
    local left = Timer.shortLabel(Timer.minutesLeft())
    if not held then return left .. " left" end
    return short and "Paused · " .. left or "Paused · " .. left .. " left"
end

-- Stops the clock, keeping the time left.
local function hold()
    if not ends_at then return end
    paused_left = math.max(0, ends_at - os.time())
    ends_at = nil
    UIManager:unschedule(finish)
end

local function release()
    if not paused_left then return end
    ends_at = os.time() + paused_left
    UIManager:scheduleIn(paused_left, finish)
    paused_left = nil
end

-- You pausing and resuming the timer.
function Timer.pause()
    if not ends_at then return end
    hold()
    held = true
end

function Timer.resume()
    if not held then return end
    held = nil
    release()
end

-- The Kindle going to sleep and waking up. A timer you paused stays paused.
function Timer.sleep()
    hold()
end

function Timer.wake()
    if not held then release() end
end

-- Pause or Resume, and Stop: the items of the menus that control a set timer.
-- `changed` runs after each, to repaint what shows the timer.
function Timer.controlItems(changed)
    local toggle = held
        and { text = "Resume timer", callback = function() Timer.resume(); changed() end }
        or { text = "Pause timer", callback = function() Timer.pause(); changed() end }
    return { toggle, { text = "Stop timer", callback = function() Timer.stop(); changed() end } }
end

return Timer
