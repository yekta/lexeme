-- The reading timer: counts down while the Kindle is awake and says when the time is up.
local UIManager = require("ui/uimanager")

local Dialog = require("lexeme/dialog")

local Timer = {}

local PRESETS = { 10, 15, 25, 30, 45, 60 }
local LAST_USED = "lexeme_reading_timer_minutes"
local CUSTOM = "lexeme_reading_timer_custom"

local minutes, ends_at, paused_left

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
    minutes, ends_at, paused_left = nil, nil, nil
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
    minutes, ends_at, paused_left = nil, nil, nil
end

function Timer.isRunning()
    return minutes ~= nil
end

function Timer.minutesLeft()
    if not minutes then return nil end
    local seconds = paused_left or math.max(0, ends_at - os.time())
    return math.max(1, math.ceil(seconds / 60))
end

function Timer.pause()
    if not ends_at then return end
    paused_left = math.max(0, ends_at - os.time())
    ends_at = nil
    UIManager:unschedule(finish)
end

function Timer.resume()
    if not paused_left then return end
    ends_at = os.time() + paused_left
    UIManager:scheduleIn(paused_left, finish)
    paused_left = nil
end

return Timer
