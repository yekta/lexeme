--[[
The last year of reading days Home shows, as Lexeme counts them across every reader.
It's fetched when a sync has sent this Kindle's reading and kept on the device, so
Home has it offline; what was read here since it was fetched is added on top.
]]
local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")
local lfs = require("libs/libkoreader-lfs")

local Api = require("lexeme/api")

local Streak = {}

local DAYS = 365

local function store()
    return LuaSettings:open(DataStorage:getSettingsDir() .. "/lexeme_streak.lua")
end

local function utcOffsetMinutes()
    local now = os.time()
    local utc = os.date("!*t", now)
    utc.isdst = false
    return math.floor(os.difftime(now, os.time(utc)) / 60 + 0.5)
end

-- Fetches the days from Lexeme and keeps them. Returns whether it got them.
function Streak.refresh()
    local ok, body = Api.get("/api/v1/reading/days?days=" .. DAYS .. "&utc_offset_minutes=" .. utcOffsetMinutes())
    if not ok or type(body) ~= "table" or type(body.days) ~= "table" or type(body.goal) ~= "table" then
        return false
    end
    local seconds = {}
    for i, day in ipairs(body.days) do seconds[i] = tonumber(day.seconds) or 0 end
    local settings = store()
    settings:saveSetting("streak", {
        fetched_at = os.time(),
        first_day = body.days[1] and body.days[1].day,
        seconds = seconds,
        daily_minutes = tonumber(body.goal.daily_minutes) or 15,
        day_starts_at = tonumber(body.goal.day_starts_at) or 0,
    })
    settings:flush()
    return true
end

local function dayKey(time, day_starts_at)
    return os.date("%Y-%m-%d", time - day_starts_at * 60)
end

local function noonOf(key)
    local y, m, d = key:match("^(%d+)-(%d+)-(%d+)$")
    return os.time{ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 }
end

-- Seconds read on this Kindle per day since `since`, from KOReader's statistics.
local function readHere(since, day_starts_at)
    local path = DataStorage:getSettingsDir() .. "/statistics.sqlite3"
    local totals = {}
    if lfs.attributes(path, "mode") ~= "file" then return totals end
    local conn = require("lua-ljsqlite3/init").open(path)
    local ok, columns = pcall(conn.exec, conn, string.format(
        "SELECT start_time, duration FROM page_stat_data WHERE start_time >= %d;", since))
    conn:close()
    if not ok or not columns then return totals end
    for i = 1, #columns[1] do
        local key = dayKey(tonumber(columns[1][i]), day_starts_at)
        totals[key] = (totals[key] or 0) + (tonumber(columns[2][i]) or 0)
    end
    return totals
end

--[[
The year ending today, oldest first, as { day = "YYYY-MM-DD", seconds = n }, and the
daily goal in minutes; nil until Lexeme has sent it once.
]]
function Streak.days()
    local saved = store():readSetting("streak")
    if not (saved and saved.first_day and saved.seconds) then return nil end
    local totals = readHere(saved.fetched_at, saved.day_starts_at)
    local first = noonOf(saved.first_day)
    for i, seconds in ipairs(saved.seconds) do
        local key = os.date("%Y-%m-%d", first + (i - 1) * 86400)
        totals[key] = (totals[key] or 0) + seconds
    end
    local today = noonOf(dayKey(os.time(), saved.day_starts_at))
    local days = {}
    for i = DAYS - 1, 0, -1 do
        local key = os.date("%Y-%m-%d", today - i * 86400)
        table.insert(days, { day = key, seconds = totals[key] or 0 })
    end
    return days, saved.daily_minutes
end

return Streak
