--[[
The reading Home shows: the last year of days, the streak, all the time read and the
books finished. `summary` is Lexeme's count across every reader, fetched at each sync,
and `fetchHours` its reading by hour; `localSummary` and `hours` count this Kindle alone
and need no account.
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
        streak = tonumber(body.streak) or 0,
        total_seconds = tonumber(body.total_seconds) or 0,
        finished_books = tonumber(body.finished_books) or 0,
        finished_this_year = tonumber(body.finished_this_year) or 0,
        year = body.days[#body.days] and body.days[#body.days].day:sub(1, 4),
    })
    settings:flush()
    return true
end

local function hoursKey(days)
    return tostring(days or "all")
end

-- Lexeme's reading by hour over the last `days` days, or all time when nil, in `Streak.hours`'
-- shape, kept for when it can't be fetched. Nil when Lexeme didn't answer.
function Streak.fetchHours(days)
    local ok, body = Api.get("/api/v1/reading/hours?utc_offset_minutes=" .. utcOffsetMinutes()
        .. (days and ("&days=" .. days) or ""))
    if not ok or type(body) ~= "table" or type(body.hours) ~= "table" or #body.hours ~= 24 then return nil end
    local result = { hours = {}, total = tonumber(body.total_seconds) or 0, days = tonumber(body.reading_days) or 0 }
    for h = 1, 24 do result.hours[h] = tonumber(body.hours[h]) or 0 end
    local settings = store()
    local kept = settings:readSetting("hours") or {}
    kept[hoursKey(days)] = result
    settings:saveSetting("hours", kept)
    settings:flush()
    return result
end

-- What `fetchHours` last got for `days`, or nil.
function Streak.keptHours(days)
    local kept = store():readSetting("hours")
    return kept and kept[hoursKey(days)]
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

-- Consecutive days that reached the goal, back from today; today unread yet doesn't break it.
local function streakOf(days, goal)
    local i = #days
    if days[i].seconds < goal then i = i - 1 end
    local streak = 0
    while i >= 1 and days[i].seconds >= goal do
        streak = streak + 1
        i = i - 1
    end
    return streak, i < 1
end

--[[
What Home shows, or nil until Lexeme has sent it once: `days`, the year ending today,
oldest first, as { day = "YYYY-MM-DD", seconds = n }; `goal_minutes`; `today`, `week`
and `total` in seconds; `streak` in days; `finished` books, and `finished_this_year`
of them this year.
]]
function Streak.summary()
    local saved = store():readSetting("streak")
    if not (saved and saved.first_day and saved.seconds) then return nil end
    local here = readHere(saved.fetched_at, saved.day_starts_at)
    local totals, total = {}, saved.total_seconds or 0
    for key, seconds in pairs(here) do
        totals[key] = seconds
        total = total + seconds
    end
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
    local goal_minutes = saved.daily_minutes
    local streak, whole_year = streakOf(days, goal_minutes * 60)
    -- A streak longer than the year shown is Lexeme's to count.
    if whole_year then streak = math.max(streak, saved.streak or 0) end
    local week = 0
    for i = #days - 6, #days do week = week + days[i].seconds end
    local year = days[#days].day:sub(1, 4)
    return {
        days = days,
        goal_minutes = goal_minutes,
        today = days[#days].seconds,
        week = week,
        total = total,
        streak = streak,
        finished = saved.finished_books or 0,
        -- Counted for the year it was fetched in; a new year starts at none.
        finished_this_year = saved.year == year and saved.finished_this_year or 0,
    }
end

-- "1h 20m", "2h", "45m", as Lexeme writes reading time.
function Streak.readingTime(seconds)
    local minutes = math.floor(seconds / 60 + 0.5)
    local hours, rest = math.floor(minutes / 60), minutes % 60
    if hours == 0 then return string.format("%dm", minutes) end
    if rest == 0 then return string.format("%dh", hours) end
    return string.format("%dh %dm", hours, rest)
end

-- Local stats ------------------------------------------------------------------
-- KOReader's page visits plus, when it's there, the Amazon reader's history
-- (lexeme_history.sqlite3, from scripts/amazon_history.py). A day counts once its reading
-- passes MIN_DAY_SECONDS, all of it, so opening a book to try a font isn't a reading day.

Streak.MIN_DAY_SECONDS = 5 * 60

local SOURCES = {
    { file = "statistics.sqlite3", table = "page_stat_data", start = "start_time", seconds = "duration" },
    { file = "lexeme_history.sqlite3", table = "sessions", start = "started_at", seconds = "seconds", kept = true },
}

local function settingsFile(name)
    return DataStorage:getSettingsDir() .. "/" .. name
end

local function columnsOf(path, sql)
    if lfs.attributes(path, "mode") ~= "file" then return nil end
    local conn = require("lua-ljsqlite3/init").open(path, "ro")
    local ok, columns = pcall(conn.exec, conn, sql)
    conn:close()
    return ok and columns or nil
end

-- A file's modification time and size, which change whenever it's written.
local function fileStamp(path)
    local attr = lfs.attributes(path)
    return attr and (attr.modification .. ":" .. attr.size) or "-"
end

-- The Amazon history holds thousands of sessions and only changes when it's reinstalled, so its
-- days are kept until the file changes. KOReader's own statistics are small and read each time.
local kept_days = {}

local function daysOf(source)
    local path = settingsFile(source.file)
    local stamp = source.kept and (fileStamp(path) .. "/" .. utcOffsetMinutes())
    local kept = kept_days[source.file]
    if stamp and kept and kept.stamp == stamp then return kept.days end
    local days = {}
    local columns = columnsOf(path, string.format(
        "SELECT date(%s, 'unixepoch', 'localtime'), SUM(%s) FROM %s GROUP BY 1;",
        source.start, source.seconds, source.table))
    for i = 1, columns and #columns[1] or 0 do
        local key = columns[1][i]
        days[key] = (days[key] or 0) + (tonumber(columns[2][i]) or 0)
    end
    if stamp then kept_days[source.file] = { stamp = stamp, days = days } end
    return days
end

-- Seconds read on each day ("YYYY-MM-DD"), only the days that pass MIN_DAY_SECONDS.
local function readingDays()
    local days = {}
    for _, source in ipairs(SOURCES) do
        for key, seconds in pairs(daysOf(source)) do days[key] = (days[key] or 0) + seconds end
    end
    for key, seconds in pairs(days) do
        if seconds < Streak.MIN_DAY_SECONDS then days[key] = nil end
    end
    return days
end

-- What the finished books depend on: the books in the history, their sidecars and the Amazon history.
local function finishedStamp()
    local DocSettings = require("docsettings")
    local parts = { fileStamp(settingsFile("lexeme_history.sqlite3")) }
    for _, entry in ipairs(require("readhistory").hist) do
        local sidecar = entry.file and DocSettings:findSidecarFile(entry.file)
        parts[#parts + 1] = string.format("%s@%s:%s", tostring(entry.file), tostring(entry.time),
            sidecar and fileStamp(sidecar) or "-")
    end
    return table.concat(parts, "|")
end

local kept_finished

-- When each finished book was finished, in epoch seconds: from KOReader and from Amazon.
-- Kept until a book in the history or its sidecar changes: finding them reads every sidecar.
local function finishedTimes()
    local stamp = finishedStamp()
    if kept_finished and kept_finished.stamp == stamp then return kept_finished.times end
    local times = {}
    for _, book in ipairs(require("lexeme/reading").books()) do
        if book.status == "finished" and book.finished_at then
            table.insert(times, math.floor(book.finished_at / 1000))
        end
    end
    local columns = columnsOf(settingsFile("lexeme_history.sqlite3"),
        "SELECT finished_at FROM books WHERE finished_at IS NOT NULL;")
    for i = 1, columns and #columns[1] or 0 do table.insert(times, tonumber(columns[1][i])) end
    kept_finished = { stamp = stamp, times = times }
    return times
end

local cached

-- Streak.summary's fields, counted on this Kindle; `streak` is the days read in a row up to today.
function Streak.localSummary()
    local now = os.time()
    local stamp = table.concat({ dayKey(now, 0),
        lfs.attributes(settingsFile("statistics.sqlite3"), "modification") or 0,
        lfs.attributes(settingsFile("lexeme_history.sqlite3"), "modification") or 0 }, "/")
    if cached and cached.stamp == stamp and now - cached.at < 60 then return cached.summary end
    local read = readingDays()
    local total = 0
    for _, seconds in pairs(read) do total = total + seconds end
    local today = noonOf(dayKey(now, 0))
    local days = {}
    for i = DAYS - 1, 0, -1 do
        local key = os.date("%Y-%m-%d", today - i * 86400)
        table.insert(days, { day = key, seconds = read[key] or 0 })
    end
    local week = 0
    for i = #days - 6, #days do week = week + days[i].seconds end
    local year, finished, finished_this_year = os.date("%Y", now), 0, 0
    for _, at in ipairs(finishedTimes()) do
        finished = finished + 1
        if os.date("%Y", at) == year then finished_this_year = finished_this_year + 1 end
    end
    local saved = store():readSetting("streak")
    local summary = {
        days = days,
        -- The goal last fetched from Lexeme, or Lexeme's default.
        goal_minutes = saved and saved.daily_minutes or 15,
        today = days[#days].seconds,
        week = week,
        total = total,
        streak = (streakOf(days, 1)),
        finished = finished,
        finished_this_year = finished_this_year,
    }
    cached = { stamp = stamp, at = now, summary = summary }
    return summary
end

--[[
Reading by hour of the day over the last `days` days, or all time when nil: `hours[1]`
is midnight to 1 AM, in seconds; `total` and `days` are the time and the reading days in
the range. A stretch running past the hour is split between the hours, and days that
don't pass MIN_DAY_SECONDS are left out, as on Home.
]]
function Streak.hours(days)
    local since = 0
    if days then since = noonOf(dayKey(os.time(), 0)) - (days - 1) * 86400 - 12 * 3600 end
    local read = readingDays()
    local result = { hours = {}, total = 0, days = 0 }
    for h = 1, 24 do result.hours[h] = 0 end
    for key, seconds in pairs(read) do
        if noonOf(key) >= since then
            result.total = result.total + seconds
            result.days = result.days + 1
        end
    end
    for _, source in ipairs(SOURCES) do
        local columns = columnsOf(settingsFile(source.file), string.format("SELECT %s, %s FROM %s WHERE %s >= %d;",
            source.start, source.seconds, source.table, source.start, since))
        for i = 1, columns and #columns[1] or 0 do
            local at, left = tonumber(columns[1][i]), tonumber(columns[2][i]) or 0
            if at and read[dayKey(at, 0)] then
                while left > 0 do
                    local t = os.date("*t", at)
                    local part = math.min(left, 3600 - t.min * 60 - t.sec)
                    result.hours[t.hour + 1] = result.hours[t.hour + 1] + part
                    at, left = at + part, left - part
                end
            end
        end
    end
    return result
end

return Streak
