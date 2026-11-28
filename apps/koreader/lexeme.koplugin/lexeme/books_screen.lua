--[[
Books as a list, a screen at a time: by the time read in each (Home's Total) or the finished
ones, newest first (Home's Finished, this year or all time). Lexeme's books while an account is
connected, otherwise this Kindle's.
]]
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Scrollbar = require("lexeme/scrollbar")
local StatsPage = require("lexeme/stats_page")
local Streak = require("lexeme/streak")

local BooksScreen = StatsPage:extend{
    mode = "time",
    range = 1,
}

local RANGES = { "This year", "All time" }
local ROW_H = 140
-- Less than shows as "0m".
local MIN_SECONDS = 30

local function count(n)
    return string.format("%d %s", n, n == 1 and "book" or "books")
end

-- "Nov 12, 2026"
local function dateLabel(time)
    return string.format("%s %d, %s", os.date("%b", time), tonumber(os.date("%d", time)), os.date("%Y", time))
end

function BooksScreen:init()
    StatsPage.init(self)
    self.first = 1
end

function BooksScreen:rows(books)
    local rows = {}
    if self.mode == "time" then
        for _, book in ipairs(books) do
            if book.seconds >= MIN_SECONDS then table.insert(rows, book) end
        end
        table.sort(rows, function(a, b) return a.seconds > b.seconds end)
        return rows
    end
    local year = os.date("%Y")
    for _, book in ipairs(books) do
        local in_range = self.range == 2 or (book.finished_at and os.date("%Y", book.finished_at) == year)
        if book.finished and in_range then table.insert(rows, book) end
    end
    table.sort(rows, function(a, b) return (a.finished_at or 0) > (b.finished_at or 0) end)
    return rows
end

function BooksScreen:render(bb, x, y, w, h)
    self.scrollbar = nil
    self:paintHeader(bb, x, y, w, self.mode == "time" and "Reading by Book" or "Finished Books")
    local top = y + D.s(330)
    if self.mode == "finished" then
        self:paintChips(bb, x, y, RANGES, self.range, function(i)
            self.range = i
            self.first = 1
        end)
        top = y + D.s(430)
    end
    local books, is_lexeme = self:load("books", Streak.fetchBooks, Streak.keptBooks, Streak.localBooks)
    if not books then return self:paintLoading(bb, x, y, w) end
    local rows = self:rows(books)
    local left = x + D.s(36)
    if self.mode == "time" then
        local total = 0
        for _, book in ipairs(rows) do total = total + book.seconds end
        D.text(bb, left, top, D.face("bold", 48), Streak.readingTime(total))
        D.text(bb, left, top + D.s(60), D.face("regular", 30), "across " .. count(#rows))
    else
        D.text(bb, left, top, D.face("bold", 48), count(#rows))
    end
    self:paintRows(bb, x, top + D.s(self.mode == "time" and 100 or 40), w, y + h - D.s(150), rows)
    self:paintNote(bb, x, y, w, h, is_lexeme and StatsPage.LEXEME_NOTE or StatsPage.LOCAL_NOTE)
end

function BooksScreen:paintRows(bb, x, top, w, bottom, rows)
    if #rows == 0 then
        local message = self.mode == "time" and "No reading yet." or "No books finished in this time yet."
        D.text(bb, x + D.s(36), top + D.s(80), D.face("regular", 32), message)
        return
    end
    local per_screen = math.max(1, math.floor((bottom - top) / D.s(ROW_H)))
    local paged = #rows > per_screen
    self.first = math.max(1, math.min(self.first, #rows))
    local left, right = x + D.s(36), x + w - D.s(paged and 120 or 36)
    local peak = rows[1].seconds
    local title_face, author_face, value_face = D.face("bold", 32), D.face("regular", 28), D.face("regular", 30)
    local last = math.min(#rows, self.first + per_screen - 1)
    for i = self.first, last do
        local book, row_top = rows[i], top + (i - self.first) * D.s(ROW_H)
        local value
        if self.mode == "time" then
            value = Streak.readingTime(book.seconds)
        else
            value = book.finished_at and dateLabel(book.finished_at) or ""
        end
        local value_w = D.width(value_face, value)
        D.textRight(bb, right, row_top + D.s(50), value_face, value)
        D.text(bb, left, row_top + D.s(50), title_face, book.title, D.BLACK, right - left - value_w - D.s(30))
        if book.authors then
            D.text(bb, left, row_top + D.s(92), author_face, book.authors, D.gray(102), right - left)
        end
        if self.mode == "time" then
            local bar_w = math.max(D.s(4), math.floor((right - left) * book.seconds / peak + 0.5))
            D.rect(bb, left, row_top + D.s(112), bar_w, D.s(8), D.BLACK)
        end
        D.rect(bb, left, row_top + D.s(ROW_H) - D.s(2), right - left, D.s(2), D.gray(200))
    end
    self.last, self.count = last, #rows
    if paged then
        Scrollbar.paint(self, bb, x + w, top - D.s(20), bottom, { at = self.first, last = last, count = #rows,
            go = function(first) self:showFrom(first) end })
    end
end

function BooksScreen:showFrom(first)
    first = math.max(1, math.min(self.count or 1, first))
    if first == self.first then return end
    self.first = first
    self:refresh()
end

function BooksScreen:onSwipe(direction, ges)
    if Scrollbar.onSwipe(self, ges) then return true end
    if direction == "east" then
        self:close("flashui")
    elseif self.last and direction == "north" and self.last < self.count then
        self:showFrom(self.last + 1)
    elseif self.last and direction == "south" then
        self:showFrom(self.first - math.max(1, self.last - self.first + 1))
    end
    return true
end

-- `mode` is "time" or "finished"; `range` picks This year (1) or All time (2) for finished.
function BooksScreen.open(mode, range)
    UIManager:show(BooksScreen:new{ mode = mode, range = range or 1 }, "flashui")
end

Scrollbar.extend(BooksScreen)

return BooksScreen
