--[[
When you read, by hour of the day: Lexeme's count across every reader while an account is
connected, otherwise this Kindle's (KOReader's reading plus the Amazon reader's history
when it's imported). Home's Today opens it.
]]
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local StatsPage = require("lexeme/stats_page")
local Streak = require("lexeme/streak")

local StatsScreen = StatsPage:extend{}

local RANGES = {
    { label = "7 days", days = 7 },
    { label = "30 days", days = 30 },
    { label = "Year", days = 365 },
    { label = "All time" },
}
local CHART = { top = 700, bottom = 1420, gap = 10 }

local selected = 2

local function twentyFourHour()
    return G_reader_settings:isFalse("lexeme_twelve_hour_clock")
end

local function hourLabel(hour)
    hour = hour % 24
    if twentyFourHour() then return string.format("%02d:00", hour) end
    return string.format("%d %s", hour % 12 == 0 and 12 or hour % 12, hour < 12 and "AM" or "PM")
end

local function tickLabel(hour)
    if twentyFourHour() then return string.format("%02d", hour) end
    return hourLabel(hour)
end

function StatsScreen:render(bb, x, y, w, h)
    self:paintHeader(bb, x, y, w, "Reading by Hour")
    local labels = {}
    for i, range in ipairs(RANGES) do labels[i] = range.label end
    self:paintChips(bb, x, y, labels, selected, function(i) selected = i end)
    local days = RANGES[selected].days
    local result, is_lexeme = self:load("hours_" .. selected,
        function() return Streak.fetchHours(days) end,
        function() return Streak.keptHours(days) end,
        function() return Streak.hours(days) end)
    if not result then return self:paintLoading(bb, x, y, w) end
    self:paintSummary(bb, x, y, w, result)
    self:paintChart(bb, x, y, w, result)
    self:paintNote(bb, x, y, w, h, is_lexeme and StatsPage.LEXEME_NOTE or StatsPage.LOCAL_DAYS_NOTE)
end

function StatsScreen:paintSummary(bb, x, y, w, result)
    local left, face = x + D.s(36), D.face("regular", 30)
    D.text(bb, left, y + D.s(440), D.face("bold", 48), Streak.readingTime(result.total))
    if result.days == 0 then return end
    D.text(bb, left, y + D.s(500), face, string.format("over %d reading %s, %s a day on average", result.days,
        result.days == 1 and "day" or "days", Streak.readingTime(result.total / result.days)), D.BLACK, w - D.s(72))
    local busiest = 1
    for hour = 2, 24 do
        if result.hours[hour] > result.hours[busiest] then busiest = hour end
    end
    D.text(bb, left, y + D.s(580), face, "Most reading: " .. hourLabel(busiest - 1) .. " to " .. hourLabel(busiest))
end

function StatsScreen:paintChart(bb, x, y, w, result)
    local left, right = x + D.s(36), x + w - D.s(36)
    local top, bottom = y + D.s(CHART.top), y + D.s(CHART.bottom)
    local peak = 0
    for hour = 1, 24 do peak = math.max(peak, result.hours[hour]) end
    if peak == 0 then
        D.textCenter(bb, math.floor((left + right) / 2), math.floor((top + bottom) / 2), D.face("regular", 32),
            "No reading in these days yet.")
        return
    end
    local gap = D.s(CHART.gap)
    -- Whole-pixel bars leave pixels over; they go between bars so the last ends at `right`.
    local function barX(i) return left + math.floor(i * (right - left + gap) / 24 + 0.5) end
    local label_face = D.face("regular", 26)
    D.text(bb, left, top - D.s(20), label_face, Streak.readingTime(peak), D.gray(102))
    D.rect(bb, left, top, right - left, D.s(2), D.gray(200))
    for hour = 1, 24 do
        local bx = barX(hour - 1)
        local bar_h = math.floor((bottom - top) * result.hours[hour] / peak + 0.5)
        if bar_h > 0 then D.rect(bb, bx, bottom - bar_h, barX(hour) - gap - bx, bar_h, D.BLACK) end
    end
    D.rect(bb, left, bottom, right - left, D.s(3), D.BLACK)
    for _, hour in ipairs({ 0, 6, 12, 18 }) do
        D.text(bb, barX(hour), bottom + D.s(44), label_face, tickLabel(hour), D.gray(102))
    end
end

function StatsScreen.open()
    UIManager:show(StatsScreen:new{}, "flashui")
end

return StatsScreen
