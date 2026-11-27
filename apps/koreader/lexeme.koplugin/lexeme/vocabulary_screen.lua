--[[
Vocabulary Builder, laid out as Amazon's: the words looked up in a grid, or by book, Learning or
Mastered, with Flashcards. Here also by language, sorted as chosen, and without Amazon's
2,000-word limit.
]]
local UIManager = require("ui/uimanager")
local logger = require("logger")

local D = require("lexeme/draw")
local Languages = require("lexeme/languages")
local Status = require("lexeme/status")
local UI = require("lexeme/vocabulary_ui")
local View = require("lexeme/view")
local Vocabulary = require("lexeme/vocabulary")

local P, F = UI.P, UI.F

local VocabularyScreen = View:extend{
    ui = nil,
}

local WORDS, BOOKS = "words", "books"
local COLUMNS = { 74, 436, 799, 1161 }
local BOOKS_PER_PAGE, BOOK_ROW = 8, 164

function VocabularyScreen:init()
    View.init(self)
    self.tab = WORDS
    self.mastered = false
    self.page = 1
    self.sort = G_reader_settings:readSetting("lexeme_vocabulary_sort") or "newest"
    self:load()
    self.lang = self:startingLanguage()
end

-- The language chosen last time; at first the book's, or the one with the most words.
function VocabularyScreen:startingLanguage()
    local saved = G_reader_settings:readSetting("lexeme_vocabulary_language")
    if saved == "" or self.has_language[saved] then return saved end
    local props = self.ui and self.ui.document and self.ui.doc_props
    local book = props and Languages.code(props.language)
    if book and self.has_language[book] then return book end
    return self.languages[1] and self.languages[1].code or ""
end

function VocabularyScreen:load()
    self.languages = Vocabulary.languages()
    self.has_language = {}
    for _, l in ipairs(self.languages) do self.has_language[l.code] = true end
    self.items, self.tally = nil, nil
end

-- After a word was deleted or moved: the lists are read again.
function VocabularyScreen:changed()
    self:load()
    if self.lang ~= "" and not self.has_language[self.lang] then self.lang = "" end
    self:refresh()
end

function VocabularyScreen:list()
    if not self.items then
        if self.tab == BOOKS and not self.book then
            self.items = Vocabulary.books{ lang = self.lang, sort = self.sort }
        else
            self.items = Vocabulary.words{ lang = self.lang, mastered = self.mastered, sort = self.sort,
                book = self.book and self.book.id }
        end
    end
    return self.items
end

function VocabularyScreen:counts()
    if not self.tally then self.tally = Vocabulary.counts(self.lang, self.book and self.book.id) end
    return self.tally
end

-- Shows a different list from its first page.
function VocabularyScreen:change(fields)
    for key, value in pairs(fields) do self[key] = value end
    self.items, self.tally = nil, nil
    self.page = fields.page or 1
    self:refresh()
end

function VocabularyScreen:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w)
    D.text(bb, P(64), P(168), F("bold", 36), "Vocabulary Builder")
    self:paintHeaderButtons(bb, w)
    D.rect(bb, 0, P(212), w, P(4), D.gray(215))
    self:paintTabs(bb)
    D.rect(bb, 0, P(298), w, P(3), D.gray(170))
    if self.tab == BOOKS and not self.book then
        self:paintBooks(bb, w, h)
    else
        if self.book then self:paintBookHeader(bb, w) end
        self:paintGrid(bb, w)
        self:paintFlashcardsButton(bb, h)
    end
end

-- Sort (not on Amazon's), About and close.
function VocabularyScreen:paintHeaderButtons(bb)
    D.icon(bb, "arrow-down-up", P(951), P(132), P(53), P(53))
    self:pressable(P(930), P(110), P(96), P(96), function() self:openSort() end,
        D.around(P(977), P(158), P(86), P(86)))
    D.icon(bb, "info", P(1052), P(132), P(53), P(53))
    self:pressable(P(1031), P(110), P(96), P(96), function() UI.About:new{}:show() end,
        D.around(P(1078), P(158), P(86), P(86)))
    UI.line(bb, P(1164), P(144), P(1194), P(172), P(3))
    UI.line(bb, P(1194), P(144), P(1164), P(172), P(3))
    self:pressable(P(1132), P(110), P(104), P(96), function() self:close("flashui") end,
        D.around(P(1179), P(158), P(86), P(86)))
end

function VocabularyScreen:paintTabs(bb)
    local words_w = D.text(bb, P(64), P(273), F(self.tab == WORDS and "bold" or "regular", 37), "Words")
    local bar_x = P(64) + words_w + P(18)
    D.rect(bb, bar_x, P(245), P(4), P(36))
    local books_x = bar_x + P(26)
    local books_w = D.text(bb, books_x, P(273), F(self.tab == BOOKS and "bold" or "regular", 37), "Books")
    self:hit(P(30), P(218), bar_x - P(30), P(80), function() self:change{ tab = WORDS, book = false } end)
    self:hit(bar_x + P(4), P(218), books_x + books_w + P(30) - bar_x, P(80), function()
        self:change{ tab = BOOKS, book = false }
    end)

    local right = P(1170)
    if self.tab == WORDS or self.book then
        local counts = self:counts()
        local label = string.format("%s (%s)", self.mastered and "Mastered" or "Learning",
            UI.count(self.mastered and counts.mastered or counts.learning))
        right = UI.dropdownLabel(self, bb, right, label, function() self:openFilter() end) - P(44)
    end
    UI.dropdownLabel(self, bb, right, self.lang == "" and "All Languages" or Languages.name(self.lang),
        function() self:openLanguages() end)
end

-- The word grid: three columns filled top to bottom, newest first, as Amazon's.
function VocabularyScreen:gridLayout()
    if self.book then return { rows = 8, top = P(508), pitch = P(117) } end
    return { rows = 9, top = P(323), pitch = P(125) }
end

function VocabularyScreen:paintGrid(bb, w)
    local list = self:list()
    local grid = self:gridLayout()
    local per_page = grid.rows * 3
    self.pages = math.max(1, math.ceil(#list / per_page))
    self.page = math.max(1, math.min(self.page, self.pages))
    if #list == 0 then
        local message = self.mastered and "Words you mark as mastered appear here."
            or "Words you look up in the dictionary appear here."
        D.textCenter(bb, math.floor(w / 2), grid.top + P(200), F("regular", 37), message, UI.GRAY, w - P(120))
        return
    end
    local face = F("bold", 37)
    local first = (self.page - 1) * per_page
    for col = 1, 3 do
        local left, right = P(COLUMNS[col]), P(COLUMNS[col + 1])
        for row = 1, grid.rows do
            local entry = list[first + (col - 1) * grid.rows + row]
            if not entry then break end
            local top = grid.top + (row - 1) * grid.pitch
            D.textCenter(bb, math.floor((left + right) / 2), top + math.floor(grid.pitch / 2) + P(14), face,
                entry.word, D.BLACK, right - left - P(30))
            if col < 3 then D.rect(bb, right, top + P(6), P(1), grid.pitch - P(10)) end
            if row < grid.rows then D.rect(bb, left, top + grid.pitch, right - left, P(1)) end
            self:pressable(left, top, right - left, grid.pitch, function() self:openCard(entry) end,
                { x = left + P(6), y = top + P(8), w = right - left - P(12), h = grid.pitch - P(16), radius = P(6) })
        end
    end
    self:paintPageArrows(bb, w, grid.top, grid.top + grid.rows * grid.pitch)
end

function VocabularyScreen:paintPageArrows(bb, w, top, bottom)
    if self.page > 1 then
        UI.triangle(bb, P(29), P(909), P(18), P(26), "left")
        self:hit(0, top, P(72), bottom - top, function() self:turn(-1) end)
    end
    if self.page < self.pages then
        UI.triangle(bb, P(1190), P(909), P(18), P(26), "right")
        self:hit(P(1163), top, w - P(1163), bottom - top, function() self:turn(1) end)
    end
end

function VocabularyScreen:turn(delta)
    local page = math.max(1, math.min(self.pages or 1, self.page + delta))
    if page == self.page then return end
    self.page = page
    self:refresh()
end

function VocabularyScreen:paintFlashcardsButton(bb, h)
    D.rect(bb, P(31), P(1520), P(1174), P(1))
    local enabled = #self:list() > 0
    D.textCenter(bb, P(618), P(1601), F("bold", 46), "Flashcards", enabled and D.BLACK or UI.GRAY)
    if enabled then
        self:pressable(P(31), P(1521), P(1174), h - P(1521), function() self:openFlashcards() end,
            { x = P(380), y = P(1540), w = P(476), h = P(90), radius = P(8) })
    end
end

-- Books ------------------------------------------------------------------------------------

function VocabularyScreen:paintBooks(bb, w, h)
    local list = self:list()
    self.pages = math.max(1, math.ceil(#list / BOOKS_PER_PAGE))
    self.page = math.max(1, math.min(self.page, self.pages))
    if #list == 0 then
        D.textCenter(bb, math.floor(w / 2), P(523), F("regular", 37), "Books you look words up in appear here.",
            UI.GRAY, w - P(120))
        return
    end
    local first = (self.page - 1) * BOOKS_PER_PAGE
    for i = 1, BOOKS_PER_PAGE do
        local book = list[first + i]
        if not book then break end
        local top = P(323) + (i - 1) * P(BOOK_ROW)
        D.text(bb, P(74), top + P(47), F("bold", 42), book.title, D.BLACK, P(720))
        if book.authors and book.authors ~= "" then
            D.text(bb, P(72), top + P(96), F("regular", 37), (book.authors:gsub("\n", ", ")), D.BLACK, P(720))
        end
        local count = UI.count(book.count) .. (book.count == 1 and " word" or " words")
        D.textRight(bb, P(1022), top + P(85), F("regular", 34), count, D.gray(85))
        UI.chevron(bb, P(1054), top + P(57), P(25), P(43), "right", P(3))
        if i < BOOKS_PER_PAGE and list[first + i + 1] then D.rect(bb, P(63), top + P(BOOK_ROW), P(1066), P(1)) end
        self:pressable(0, top, P(1150), P(BOOK_ROW), function() self:openBook(book) end,
            { x = P(40), y = top + P(8), w = P(1100), h = P(BOOK_ROW - 16), radius = P(8) })
    end
    self:paintScrollbar(bb, h)
end

-- The line and thumb beside the books, as Amazon's; a tap on it jumps there.
function VocabularyScreen:paintScrollbar(bb, h)
    if self.pages <= 1 then return end
    local top, bottom = P(324), h
    local span = bottom - top
    D.rect(bb, P(1206), top, P(3), span)
    local thumb_h = math.max(P(60), math.floor(span / self.pages))
    local thumb_y = top + math.floor((span - thumb_h) * (self.page - 1) / (self.pages - 1))
    D.roundRect(bb, P(1203), thumb_y, P(9), thumb_h, D.BLACK, P(4))
    self:hit(P(1170), top, P(66), span, function()
        local at = (self.last_tap and self.last_tap.y or top) - top
        local page = math.floor(at / span * self.pages) + 1
        self.page = math.max(1, math.min(self.pages, page))
        self:refresh()
    end)
end

function VocabularyScreen:openBook(book)
    self.books_page = self.page
    self:change{ book = book }
end

function VocabularyScreen:paintBookHeader(bb, w)
    UI.chevron(bb, P(69), P(336), P(15), P(25), "left", P(3))
    D.text(bb, P(101), P(361), F("bold", 37), "Any Book")
    self:pressable(P(40), P(312), P(300), P(70), function()
        self:change{ book = false, page = self.books_page or 1 }
    end, { x = P(50), y = P(318), w = P(240), h = P(58), radius = P(6) })
    D.text(bb, P(110), P(420), F("regular", 46), self.book.title, D.BLACK, w - P(160))
    if self.book.authors and self.book.authors ~= "" then
        D.text(bb, P(112), P(467), F("regular", 32), (self.book.authors:gsub("\n", ", ")), D.BLACK, w - P(160))
    end
    D.rect(bb, P(63), P(508), P(1070), P(1))
end

-- Dropdowns --------------------------------------------------------------------------------

function VocabularyScreen:openFilter()
    local counts = self:counts()
    UI.Dropdown:new{ right = P(1208), top = P(318), items = {
        { text = "Learning (" .. UI.count(counts.learning) .. ")", checked = not self.mastered,
            callback = function() self:change{ mastered = false } end },
        { text = "Mastered (" .. UI.count(counts.mastered) .. ")", checked = self.mastered,
            callback = function() self:change{ mastered = true } end },
    } }:show()
end

local function chooseLanguage(self, code)
    G_reader_settings:saveSetting("lexeme_vocabulary_language", code)
    self:change{ lang = code, book = false }
end

function VocabularyScreen:openLanguages()
    local total = 0
    for _, l in ipairs(self.languages) do total = total + l.count end
    local items = { { text = "All Languages (" .. UI.count(total) .. ")", checked = self.lang == "",
        callback = function() chooseLanguage(self, "") end } }
    for _, l in ipairs(self.languages) do
        table.insert(items, { text = Languages.name(l.code) .. " (" .. UI.count(l.count) .. ")",
            checked = self.lang == l.code, callback = function() chooseLanguage(self, l.code) end })
    end
    UI.Dropdown:new{ right = P(1208), top = P(318), items = items }:show()
end

function VocabularyScreen:openSort()
    local items = {}
    for _, sort in ipairs(Vocabulary.SORTS) do
        local label = sort.label
        if sort.key == "most" and self.tab == BOOKS and not self.book then label = "Most Words" end
        table.insert(items, { text = label, checked = self.sort == sort.key, callback = function()
            G_reader_settings:saveSetting("lexeme_vocabulary_sort", sort.key)
            self:change{ sort = sort.key }
        end })
    end
    UI.Dropdown:new{ right = P(1208), top = P(230), items = items }:show()
end

-- Cards and flashcards ---------------------------------------------------------------------

function VocabularyScreen:openCard(entry)
    UI.Card:new{ ui = self.ui, entry = entry, on_change = function() self:changed() end }:show()
end

function VocabularyScreen:openFlashcards()
    local deck = {}
    for i, entry in ipairs(self:list()) do deck[i] = entry end
    require("lexeme/flashcards").show(self.ui, deck, function() self:changed() end)
end

function VocabularyScreen:onSwipe(direction)
    if direction == "west" or direction == "north" then
        self:turn(1)
    elseif direction == "east" or direction == "south" then
        self:turn(-1)
    end
    return true
end

UI.guard(VocabularyScreen)

function VocabularyScreen.show(ui)
    local ok, err = pcall(function()
        Vocabulary.import()
        UIManager:show(VocabularyScreen:new{ ui = ui }, "flashui")
    end)
    if not ok then logger.warn("Lexeme: Vocabulary Builder", err) end
end

return VocabularyScreen
