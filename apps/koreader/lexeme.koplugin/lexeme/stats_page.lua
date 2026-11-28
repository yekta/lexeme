--[[
What the screens Home's reading figures open share: the title bar, the range chips, the note
at the bottom, and where their figures come from: Lexeme's count across every reader while an
account is connected, otherwise this Kindle's.
]]
local NetworkMgr = require("ui/network/manager")

local Background = require("lexeme/background")
local D = require("lexeme/draw")
local Status = require("lexeme/status")
local Streak = require("lexeme/streak")
local Sync = require("lexeme/sync")
local View = require("lexeme/view")

local StatsPage = View:extend{}

StatsPage.LEXEME_NOTE = "Counted in Lexeme, across all your readers."
StatsPage.LOCAL_NOTE = "Counted on this Kindle, with your Amazon history if it's imported."
StatsPage.LOCAL_DAYS_NOTE = string.format("%s A day counts once you've read %d minutes in it.", StatsPage.LOCAL_NOTE,
    math.floor(Streak.MIN_DAY_SECONDS / 60))

local CHIPS = { top = 252, h = 78, pad = 33, gap = 15, baseline = 50 }

-- Home's figures and whether they're Lexeme's.
function StatsPage.summary()
    if Sync.isConnected() then
        local summary = Streak.summary()
        if summary then return summary, true end
    end
    return Streak.localSummary(), false
end

function StatsPage:init()
    View.init(self)
    self.loads = {}
end

function StatsPage:onCloseWidget()
    self.closed = true
end

function StatsPage:onSwipe(direction)
    if direction == "east" then self:close("flashui") end
end

function StatsPage:paintHeader(bb, x, y, w, title)
    Status.paint(self, bb, x, y, w)
    D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
    self:pressable(x, y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(7), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    D.text(bb, x + D.s(139), y + D.s(168), D.face("bold", 34), title)
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))
end

-- Pill-shaped chips under the title bar, `selected` filled; tapping one calls `on_select(i)`.
function StatsPage:paintChips(bb, x, y, labels, selected, on_select)
    local face = D.face("regular", 32)
    local chip_x, top, chip_h = x + D.s(36), y + D.s(CHIPS.top), D.s(CHIPS.h)
    for i, label in ipairs(labels) do
        local chip_w = D.width(face, label) + 2 * D.s(CHIPS.pad)
        if i == selected then
            D.roundRect(bb, chip_x, top, chip_w, chip_h, D.BLACK, math.floor(chip_h / 2))
        else
            D.border(bb, chip_x, top, chip_w, chip_h, D.s(2), D.BLACK, math.floor(chip_h / 2))
        end
        local color = i == selected and D.WHITE or D.BLACK
        D.text(bb, chip_x + D.s(CHIPS.pad), top + D.s(CHIPS.baseline), face, label, color)
        self:hit(chip_x, top, chip_w, chip_h, function()
            on_select(i)
            self:refresh("ui")
        end)
        chip_x = chip_x + chip_w + D.s(CHIPS.gap)
    end
end

function StatsPage:paintNote(bb, x, y, w, h, note)
    local face = D.face("regular", 26)
    for i, line in ipairs(D.wrap(face, note, w - D.s(72), 2)) do
        D.text(bb, x + D.s(36), y + h - D.s(110) + (i - 1) * D.s(38), face, line, D.gray(102))
    end
end

function StatsPage:paintLoading(bb, x, y, w)
    D.textCenter(bb, x + math.floor(w / 2), y + D.s(800), D.face("regular", 32), "Loading…")
end

--[[
The figures for `key` and whether they're Lexeme's. While connected: what `fetch` got on this visit
(fetched in the background once, the screen repainting when it's back), else what `kept` has, else
nil while it's on its way. Without an account, or with no answer and nothing kept, `fallback`'s.
]]
function StatsPage:load(key, fetch, kept, fallback)
    local load = self.loads[key]
    if not load then
        load = {}
        self.loads[key] = load
    end
    if Sync.isConnected() then
        if not load.started then
            load.started = true
            if NetworkMgr:isConnected() then
                Background.run(function()
                    load.result = fetch()
                    load.done = true
                    if not self.closed then self:refresh("ui") end
                end)
            else
                load.done = true
            end
        end
        local lexeme = load.result or kept()
        if lexeme then return lexeme, true end
        if not load.done then return nil end
    end
    if not load.fallback then load.fallback = fallback() end
    return load.fallback, false
end

return StatsPage
