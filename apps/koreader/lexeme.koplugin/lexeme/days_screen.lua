--[[
Time read over the last 7 or 30 days, a bar for each day, or over the year, a bar for each month.
Home's This week opens it; it counts what Home counts.
]]
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local StatsPage = require("lexeme/stats_page")
local Streak = require("lexeme/streak")

local DaysScreen = StatsPage:extend{}

local RANGES = {
    { label = "7 days", days = 7, gap = 36 },
    { label = "30 days", days = 30, gap = 10 },
    { label = "Year", gap = 24 },
}
local CHART = { top = 700, bottom = 1420 }

local selected = 1

local function noonOf(key)
    local y, m, d = key:match("^(%d+)-(%d+)-(%d+)$")
    return os.time{ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 }
end

local function sum(days)
    local total = 0
    for _, day in ipairs(days) do total = total + day.seconds end
    return total
end

local function slice(days, from, to)
    local part = {}
    for i = math.max(1, from), to do table.insert(part, days[i]) end
    return part
end

-- The days from the first of the month eleven months back to today.
local function yearOf(days)
    local y, m = days[#days].day:match("^(%d+)-(%d+)")
    local month = tonumber(y) * 12 + tonumber(m) - 1 - 11
    local first = string.format("%04d-%02d-01", math.floor(month / 12), month % 12 + 1)
    local part = {}
    for _, day in ipairs(days) do
        if day.day >= first then table.insert(part, day) end
    end
    return part
end

local function dayLabel(days, i)
    if i == #days then return "Today" end
    local noon = noonOf(days[i].day)
    if #days <= 7 then return os.date("%a", noon) end
    if (#days - i) % 7 ~= 0 then return nil end
    return os.date("%b ", noon) .. tonumber(os.date("%d", noon))
end

local function dayBars(days)
    local bars = {}
    for i, day in ipairs(days) do
        bars[i] = { seconds = day.seconds, label = dayLabel(days, i), show_value = #days <= 7 }
    end
    return bars
end

local function monthBars(days)
    local bars, by_month = {}, {}
    for _, day in ipairs(days) do
        local key = day.day:sub(1, 7)
        local bar = by_month[key]
        if not bar then
            bar = { seconds = 0, label = os.date("%b", noonOf(key .. "-15")) }
            by_month[key] = bar
            table.insert(bars, bar)
        end
        bar.seconds = bar.seconds + day.seconds
    end
    return bars
end

function DaysScreen:render(bb, x, y, w, h)
    self:paintHeader(bb, x, y, w, "Reading Time")
    local labels = {}
    for i, range in ipairs(RANGES) do labels[i] = range.label end
    self:paintChips(bb, x, y, labels, selected, function(i) selected = i end)
    local reading, is_lexeme = StatsPage.summary()
    local range, all = RANGES[selected], reading.days
    local days = range.days and slice(all, #all - range.days + 1, #all) or yearOf(all)
    local bars = range.days and dayBars(days) or monthBars(days)
    self:paintSummary(bb, x, y, w, range, all, days, bars)
    self:paintChart(bb, x, y, w, bars, range.gap)
    self:paintNote(bb, x, y, w, h, is_lexeme and StatsPage.LEXEME_NOTE or StatsPage.LOCAL_DAYS_NOTE)
end

function DaysScreen:paintSummary(bb, x, y, w, range, all, days, bars)
    local most = 0
    for _, bar in ipairs(bars) do most = math.max(most, bar.seconds) end
    local left, face = x + D.s(36), D.face("regular", 30)
    D.text(bb, left, y + D.s(440), D.face("bold", 48), Streak.readingTime(sum(days)))
    D.text(bb, left, y + D.s(500), face, (range.days and "Most in a day: " or "Most in a month: ")
        .. Streak.readingTime(most))
    local last = range.days
        and string.format("Previous %d days: %s", range.days,
            Streak.readingTime(sum(slice(all, #all - 2 * range.days + 1, #all - range.days))))
        or Streak.readingTime(sum(days) / #days) .. " a day on average"
    D.text(bb, left, y + D.s(580), face, last)
end

function DaysScreen:paintChart(bb, x, y, w, bars, gap)
    local left, right = x + D.s(36), x + w - D.s(36)
    local top, bottom = y + D.s(CHART.top), y + D.s(CHART.bottom)
    local peak = 0
    for _, bar in ipairs(bars) do peak = math.max(peak, bar.seconds) end
    if peak == 0 then
        D.textCenter(bb, math.floor((left + right) / 2), math.floor((top + bottom) / 2), D.face("regular", 32),
            "No reading in these days yet.")
        return
    end
    gap = D.s(gap)
    local function barX(i) return left + math.floor(i * (right - left + gap) / #bars + 0.5) end
    local function heightOf(seconds) return math.floor((bottom - top) * seconds / peak + 0.5) end
    local label_face = D.face("regular", 26)
    for i, bar in ipairs(bars) do
        local bx = barX(i - 1)
        local bar_w = barX(i) - gap - bx
        local bar_h = heightOf(bar.seconds)
        if bar_h > 0 then D.rect(bb, bx, bottom - bar_h, bar_w, bar_h, D.BLACK) end
        local center = bx + math.floor(bar_w / 2)
        if bar.show_value and bar.seconds > 0 then
            D.textCenter(bb, center, bottom - bar_h - D.s(14), label_face, Streak.readingTime(bar.seconds), D.gray(68))
        end
        if bar.label then
            local half = math.floor(D.width(label_face, bar.label) / 2)
            center = math.max(left + half, math.min(right - half, center))
            D.textCenter(bb, center, bottom + D.s(44), label_face, bar.label, D.gray(102))
        end
    end
    if not bars[1].show_value then
        D.text(bb, left, top - D.s(20), label_face, Streak.readingTime(peak), D.gray(102))
        D.rect(bb, left, top, right - left, D.s(2), D.gray(200))
    end
    D.rect(bb, left, bottom, right - left, D.s(3), D.BLACK)
end

function DaysScreen.open()
    UIManager:show(DaysScreen:new{}, "flashui")
end

return DaysScreen
