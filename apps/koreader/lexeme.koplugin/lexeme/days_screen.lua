--[[
The last seven days, a bar for each against the daily goal, with last week's time beside it.
Home's This week opens it; it counts what Home counts.
]]
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local StatsPage = require("lexeme/stats_page")
local Streak = require("lexeme/streak")

local DaysScreen = StatsPage:extend{}

local CHART = { top = 640, bottom = 1400, gap = 36 }

local function noonOf(key)
    local y, m, d = key:match("^(%d+)-(%d+)-(%d+)$")
    return os.time{ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 }
end

local function sum(days, from, to)
    local total = 0
    for i = math.max(1, from), to do total = total + days[i].seconds end
    return total
end

function DaysScreen:render(bb, x, y, w, h)
    self:paintHeader(bb, x, y, w, "Reading by Day")
    local reading, is_lexeme = StatsPage.summary()
    local days, goal = reading.days, reading.goal_minutes * 60
    local week = {}
    for i = #days - 6, #days do table.insert(week, days[i]) end
    local reached = 0
    for _, day in ipairs(week) do
        if day.seconds >= goal then reached = reached + 1 end
    end
    local left, face = x + D.s(36), D.face("regular", 30)
    D.text(bb, left, y + D.s(330), D.face("bold", 48), Streak.readingTime(reading.week))
    D.text(bb, left, y + D.s(390), face, string.format("%d of 7 days reached your %s goal", reached,
        Streak.readingTime(goal)))
    D.text(bb, left, y + D.s(470), face, "Last week: " .. Streak.readingTime(sum(days, #days - 13, #days - 7)))
    self:paintChart(bb, x, y, w, week, goal)
    self:paintNote(bb, x, y, w, h, is_lexeme and StatsPage.LEXEME_NOTE or StatsPage.LOCAL_DAYS_NOTE)
end

function DaysScreen:paintChart(bb, x, y, w, week, goal)
    local left, right = x + D.s(36), x + w - D.s(36)
    local top, bottom = y + D.s(CHART.top), y + D.s(CHART.bottom)
    local peak = goal
    for _, day in ipairs(week) do peak = math.max(peak, day.seconds) end
    local gap = D.s(CHART.gap)
    local function barX(i) return left + math.floor(i * (right - left + gap) / #week + 0.5) end
    local label_face, value_face = D.face("regular", 26), D.face("regular", 26)
    local function heightOf(seconds) return math.floor((bottom - top) * seconds / peak + 0.5) end
    for i, day in ipairs(week) do
        local bx = barX(i - 1)
        local bar_w = barX(i) - gap - bx
        local bar_h = heightOf(day.seconds)
        if bar_h > 0 then D.rect(bb, bx, bottom - bar_h, bar_w, bar_h, D.BLACK) end
        local center = bx + math.floor(bar_w / 2)
        if day.seconds > 0 then
            D.textCenter(bb, center, bottom - bar_h - D.s(14), value_face, Streak.readingTime(day.seconds), D.gray(68))
        end
        local label = i == #week and "Today" or os.date("%a", noonOf(day.day))
        D.textCenter(bb, center, bottom + D.s(44), label_face, label, D.gray(102))
    end
    local goal_y = bottom - heightOf(goal)
    for dx = left, right, D.s(16) do D.rect(bb, dx, goal_y, math.min(D.s(8), right - dx), D.s(2), D.gray(102)) end
    D.textRight(bb, right, goal_y - D.s(12), label_face, "Goal " .. Streak.readingTime(goal), D.gray(102))
    D.rect(bb, left, bottom, right - left, D.s(3), D.BLACK)
end

function DaysScreen.open()
    UIManager:show(DaysScreen:new{}, "flashui")
end

return DaysScreen
