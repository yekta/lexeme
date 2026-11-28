--[[
The streak: how many days in a row reached the daily goal, the longest run in the last year,
and the year's calendar. Home's Streak and calendar open it; it counts what Home counts.
]]
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local StatsPage = require("lexeme/stats_page")
local Streak = require("lexeme/streak")

local StreakScreen = StatsPage:extend{}

local function days(n)
    return string.format("%d %s", n, n == 1 and "day" or "days")
end

local function longestRun(list, goal)
    local longest, run = 0, 0
    for _, day in ipairs(list) do
        run = day.seconds >= goal and run + 1 or 0
        longest = math.max(longest, run)
    end
    return longest
end

function StreakScreen:render(bb, x, y, w, h)
    self:paintHeader(bb, x, y, w, "Streak")
    local reading, is_lexeme = StatsPage.summary()
    local goal = reading.goal_minutes * 60
    local reached = 0
    for _, day in ipairs(reading.days) do
        if day.seconds >= goal then reached = reached + 1 end
    end
    local left, face = x + D.s(36), D.face("regular", 30)
    D.text(bb, left, y + D.s(330), D.face("bold", 48), days(reading.streak))
    D.text(bb, left, y + D.s(390), face, "Longest in the last year: "
        .. days(math.max(reading.streak, longestRun(reading.days, goal))))
    D.text(bb, left, y + D.s(470), face, string.format("Your goal of %s a day was reached on %s of the last %d.",
        Streak.readingTime(goal), days(reached), #reading.days), D.BLACK, w - D.s(72))
    require("lexeme/shell").paintReadingCalendar(bb, x, y + D.s(560), w, reading)
    self:paintNote(bb, x, y, w, h, is_lexeme and StatsPage.LEXEME_NOTE or StatsPage.LOCAL_DAYS_NOTE)
end

function StreakScreen.open()
    UIManager:show(StreakScreen:new{}, "flashui")
end

return StreakScreen
