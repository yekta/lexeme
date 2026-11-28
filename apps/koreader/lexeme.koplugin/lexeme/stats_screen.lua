--[[
When you read, by hour of the day: Lexeme's count across every reader while an account is
connected, otherwise this Kindle's (KOReader's reading plus the Amazon reader's history
when it's imported). Home's stats open it.
]]
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")

local Background = require("lexeme/background")
local D = require("lexeme/draw")
local Status = require("lexeme/status")
local Streak = require("lexeme/streak")
local Sync = require("lexeme/sync")
local View = require("lexeme/view")

local StatsScreen = View:extend{}

local RANGES = {
    { label = "7 days", days = 7 },
    { label = "30 days", days = 30 },
    { label = "Year", days = 365 },
    { label = "All time" },
}
local CHIPS = { top = 252, h = 78, pad = 33, gap = 15, baseline = 50 }
local CHART = { top = 700, bottom = 1420, gap = 10 }
local LOCAL_NOTE = "Counted on this Kindle, with your Amazon history if it's imported. A day counts once you've "
    .. "read 5 minutes in it."
local LEXEME_NOTE = "Counted in Lexeme, across all your readers."

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

function StatsScreen:init()
    View.init(self)
    self.fetched, self.failed, self.locals = {}, {}, {}
end

function StatsScreen:onCloseWidget()
    self.closed = true
end

-- The selected range's reading and whether it's Lexeme's; nil while Lexeme's is on its way.
function StatsScreen:result()
    local days = RANGES[selected].days
    if Sync.isConnected() then
        self:fetch(selected)
        local lexeme = self.fetched[selected] or Streak.keptHours(days)
        if lexeme then return lexeme, true end
        if not self.failed[selected] then return nil end
    end
    if not self.locals[selected] then self.locals[selected] = Streak.hours(days) end
    return self.locals[selected], false
end

function StatsScreen:fetch(i)
    if self.fetched[i] or self.failed[i] then return end
    if not NetworkMgr:isConnected() then
        self.failed[i] = true
        return
    end
    Background.run(function()
        local result = Streak.fetchHours(RANGES[i].days)
        if result then self.fetched[i] = result else self.failed[i] = true end
        if not self.closed then self:refresh("ui") end
    end, "stats_hours_" .. i)
end

function StatsScreen:onSwipe(direction)
    if direction == "east" then self:close("flashui") end
end

function StatsScreen:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w)
    D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
    self:pressable(x, y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(7), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    D.text(bb, x + D.s(139), y + D.s(168), D.face("bold", 34), "Reading by Hour")
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))
    self:paintChips(bb, x, y)
    local result, is_lexeme = self:result()
    if not result then
        D.textCenter(bb, x + math.floor(w / 2), y + D.s(800), D.face("regular", 32), "Loading…")
        return
    end
    self:paintSummary(bb, x, y, w, result)
    self:paintChart(bb, x, y, w, result)
    local face = D.face("regular", 26)
    for i, line in ipairs(D.wrap(face, is_lexeme and LEXEME_NOTE or LOCAL_NOTE, w - D.s(72), 2)) do
        D.text(bb, x + D.s(36), y + h - D.s(110) + (i - 1) * D.s(38), face, line, D.gray(102))
    end
end

function StatsScreen:paintChips(bb, x, y)
    local face = D.face("regular", 32)
    local chip_x, top, chip_h = x + D.s(36), y + D.s(CHIPS.top), D.s(CHIPS.h)
    for i, range in ipairs(RANGES) do
        local chip_w = D.width(face, range.label) + 2 * D.s(CHIPS.pad)
        if i == selected then
            D.roundRect(bb, chip_x, top, chip_w, chip_h, D.BLACK, math.floor(chip_h / 2))
        else
            D.border(bb, chip_x, top, chip_w, chip_h, D.s(2), D.BLACK, math.floor(chip_h / 2))
        end
        D.text(bb, chip_x + D.s(CHIPS.pad), top + D.s(CHIPS.baseline), face, range.label,
            i == selected and D.WHITE or D.BLACK)
        self:hit(chip_x, top, chip_w, chip_h, function()
            selected = i
            self:refresh("ui")
        end)
        chip_x = chip_x + chip_w + D.s(CHIPS.gap)
    end
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
