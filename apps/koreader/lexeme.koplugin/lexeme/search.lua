--[[
The search screen: a search field, live matches, the keyboard, and a results
page. In the library it searches titles and authors; in a book, the book's text.
]]
local Event = require("ui/event")
local UIManager = require("ui/uimanager")

local Books = require("lexeme/books")
local D = require("lexeme/draw")
local Keyboard = require("lexeme/keyboard")
local Status = require("lexeme/status")
local View = require("lexeme/view")

local Search = View:extend{
    -- "library" or "book"
    mode = "library",
    shell = nil, -- library mode
    ui = nil, -- book mode
}

local MAX_HISTORY = 8

function Search:init()
    View.init(self)
    self.query = ""
    self.results = nil -- set once a search is submitted
    self.page = 1
    self.keyboard = Keyboard.new{
        on_input = function(text, is_suggestion) self:input(text, is_suggestion) end,
        on_backspace = function() self:backspace() end,
        on_enter = function() self:submit() end,
        suggestions = function() return self:wordSuggestions() end,
    }
end

-- Input --------------------------------------------------------------------------

function Search:input(text, is_suggestion)
    if is_suggestion then
        self.query = self.query:gsub("%S*$", "") .. text .. " "
    else
        self.query = self.query .. text
    end
    self.keyboard.first_suggestion = 1
    self.results = nil
    self:refresh("fast")
end

function Search:backspace()
    if self.query == "" then return end
    -- Drop the last UTF-8 character.
    self.query = self.query:gsub("[%z\1-\127\194-\244][\128-\191]*$", "")
    self.results = nil
    self:refresh("fast")
end

local function words(text, into, seen)
    for word in text:gmatch("[%w\128-\255]+") do
        local lower = word:lower()
        if not seen[lower] then
            seen[lower] = true
            table.insert(into, word)
        end
    end
end

-- Words from the library (or the book's title) that start with what's being typed.
function Search:wordSuggestions()
    local prefix = self.query:match("(%S+)$")
    if not prefix then return {} end
    local pool, seen = {}, {}
    if self.mode == "library" then
        for _, book in ipairs(self.shell.all) do
            words(book.title, pool, seen)
            words(book.authors or "", pool, seen)
        end
    end
    local lower, matches = prefix:lower(), {}
    for _, word in ipairs(pool) do
        if word:lower():sub(1, #lower) == lower and word:lower() ~= lower then table.insert(matches, word) end
    end
    table.sort(matches, function(a, b) return #a < #b end)
    return matches
end

function Search:history()
    if self.mode == "book" then
        return self.ui.doc_settings:readSetting("lexeme_searches") or {}
    end
    return G_reader_settings:readSetting("lexeme_library_searches") or {}
end

function Search:saveHistory(list)
    if self.mode == "book" then
        self.ui.doc_settings:saveSetting("lexeme_searches", list)
    else
        G_reader_settings:saveSetting("lexeme_library_searches", list)
    end
end

function Search:remember(query)
    local list = { query }
    for _, previous in ipairs(self:history()) do
        if previous ~= query and #list < MAX_HISTORY then table.insert(list, previous) end
    end
    self:saveHistory(list)
end

function Search:submit()
    local query = self.query:gsub("^%s+", ""):gsub("%s+$", "")
    if query == "" then return end
    self:remember(query)
    self.page = 1
    if self.mode == "library" then
        self.results = self:libraryMatches(query)
    else
        self.results = self:bookMatches(query)
    end
    self:refresh("flashui")
end

function Search:libraryMatches(query)
    local q, matches = query:lower(), {}
    for _, book in ipairs(Books.query(self.shell.all, nil, "recent", true)) do
        if book.title:lower():find(q, 1, true) or (book.authors or ""):lower():find(q, 1, true) then
            table.insert(matches, book)
        end
    end
    return matches
end

function Search:bookMatches(query)
    local ok, results = pcall(self.ui.document.findAllText, self.ui.document, query, true, 6, 2000, false, 0)
    return ok and results or {}
end

-- Painting ----------------------------------------------------------------------------

function Search:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w)
    self:paintField(bb, x, y, w)
    if self.results then
        if self.mode == "library" then
            self:paintLibraryResults(bb, x, y, w, h)
        else
            self:paintBookResults(bb, x, y, w, h)
        end
    else
        if self.query == "" then
            self:paintHistory(bb, x, y, w)
        elseif self.mode == "library" then
            self:paintSuggestions(bb, x, y, w)
        end
        self.keyboard:paint(self, bb, x, w)
    end
end

function Search:paintField(bb, x, y, w)
    local pill_w = D.s(1149 - 36)
    D.border(bb, x + D.s(36), y + D.s(108), pill_w, D.s(101), D.s(2), D.BLACK, D.s(50))
    D.icon(bb, "search", x + D.s(86), y + D.s(136), D.s(42), D.s(42))
    local face = D.face("regular", 34)
    if self.query == "" then
        local hint = self.mode == "book" and "Search in this book" or "Search Kindle"
        D.text(bb, x + D.s(160), y + D.s(170), face, hint, D.gray(120))
        D.rect(bb, x + D.s(158), y + D.s(138), D.s(2), D.s(42))
    else
        local tw = D.text(bb, x + D.s(160), y + D.s(170), face, self.query, D.BLACK, pill_w - D.s(230))
        if not self.results then
            D.rect(bb, x + D.s(162) + tw, y + D.s(138), D.s(2), D.s(42))
            D.icon(bb, "arrow-right", x + D.s(1060), y + D.s(136), D.s(46), D.s(46))
            self:pressable(x + D.s(1030), y + D.s(108), D.s(110), D.s(101), function() self:submit() end,
                D.around(x + D.s(1083), y + D.s(159), D.s(86), D.s(86)))
        end
    end
    -- Tapping the field after a search brings the keyboard back.
    self:hit(x + D.s(36), y + D.s(108), D.s(990), D.s(101), function()
        if self.results then
            self.results = nil
            self:refresh("flashui")
        end
    end)
    D.icon(bb, "x", x + D.s(1188), y + D.s(132), D.s(52), D.s(52))
    self:pressable(x + D.s(1160), y + D.s(100), w - D.s(1160), D.s(115), function() self:close("flashui") end,
        { x = x + D.s(1164), y = y + D.s(108), w = D.s(101), h = D.s(101) })
end

function Search:paintHistory(bb, x, y, w)
    local history = self:history()
    if #history == 0 then return end
    D.text(bb, x + D.s(40), y + D.s(312), D.face("bold", 36), "Recent searches")
    local clear_face = D.face("regular", 30)
    local cw = D.width(clear_face, "Clear history")
    D.text(bb, x + w - D.s(120) - cw, y + D.s(310), clear_face, "Clear history")
    D.rect(bb, x + w - D.s(120) - cw, y + D.s(318), cw, D.s(2))
    self:pressable(x + w - D.s(140) - cw, y + D.s(260), cw + D.s(40), D.s(80), function()
        self:saveHistory({})
        self:refresh()
    end, { x = x + w - D.s(120) - cw, y = y + D.s(310 - 32), w = cw, h = D.s(42) })
    for i, query in ipairs(history) do
        local baseline = y + D.s(395 + (i - 1) * 76)
        D.icon(bb, "history", x + D.s(66), baseline - D.s(30), D.s(40), D.s(40))
        D.text(bb, x + D.s(152), baseline, D.face("regular", 32), query, D.BLACK, w - D.s(300))
        self:pressable(x, baseline - D.s(55), w, D.s(76), function()
            self.query = query
            self:submit()
        end, { x = x + D.s(39), y = baseline - D.s(47), w = D.s(1138), h = D.s(72) })
    end
end

-- Draws text with the first case-insensitive match of `query` in bold.
local function textWithMatch(bb, x, baseline, text, query, max_w)
    local regular, bold = D.face("regular", 34), D.face("bold", 34)
    text = D.fit(regular, text, max_w)
    local s, e = text:lower():find(query:lower(), 1, true)
    if not s then return D.text(bb, x, baseline, regular, text) end
    local cx = x
    cx = cx + D.text(bb, cx, baseline, regular, text:sub(1, s - 1))
    cx = cx + D.text(bb, cx, baseline, bold, text:sub(s, e))
    D.text(bb, cx, baseline, regular, text:sub(e + 1))
end

function Search:paintSuggestions(bb, x, y, w)
    local query = self.query:gsub("%s+$", "")
    local top = y + D.s(253)
    local max_rows = 5
    for i, book in ipairs(self:libraryMatches(query)) do
        if i > max_rows then break end
        D.icon(bb, "book-open", x + D.s(68), top + D.s(8), D.s(42), D.s(42))
        local lines = D.wrap(D.face("regular", 34), book.title, D.s(1080 - 142), 2)
        local baseline = top + D.s(27)
        for _, line in ipairs(lines) do
            textWithMatch(bb, x + D.s(142), baseline, line, query, D.s(1080 - 142))
            baseline = baseline + D.s(45)
        end
        if book.authors then
            D.text(bb, x + D.s(142), baseline - D.s(8), D.face("regular", 24), book.authors, D.BLACK, D.s(900))
            baseline = baseline + D.s(30)
        end
        D.icon(bb, "chevron-right", x + D.s(1105), top + D.s(5), D.s(42), D.s(42))
        local row_h = baseline - top
        self:hit(x, top - D.s(10), w, row_h, function() self.shell.open_book(book.path) end)
        top = top + row_h + D.s(30)
    end
    D.rect(bb, x + D.s(39), top, D.s(1176 - 39), D.s(2))
    local row = top + D.s(54)
    D.icon(bb, "search", x + D.s(66), row - D.s(36), D.s(46), D.s(46))
    local regular, bold = D.face("regular", 34), D.face("bold", 34)
    local cx = x + D.s(142)
    cx = cx + D.text(bb, cx, row, regular, "Search everywhere for ")
    D.text(bb, cx, row, bold, "\"" .. query .. "\"", D.BLACK, w - cx - D.s(60))
    self:pressable(x, top, w, D.s(100), function() self:submit() end,
        { x = x + D.s(39), y = row - D.s(47), w = D.s(1138), h = D.s(72) })
end

function Search:paintLibraryResults(bb, x, y, w, h)
    D.rect(bb, x, y + D.s(244), w, D.s(3), D.gray(170))
    local heading = string.format("Results from your Library (%d)", #self.results)
    D.text(bb, x + D.s(57), y + D.s(312), D.face("bold", 34), heading)
    D.icon(bb, "chevron-right", x + D.s(1080), y + D.s(278), D.s(46), D.s(46))
    self:pressable(x, y + D.s(250), w, D.s(100), function() self:showInLibrary() end,
        { x = x + D.s(56), y = y + D.s(312 - 64), w = D.s(1090), h = D.s(95) })
    local cover_w, cover_h = D.s(245), D.s(310)
    for i, book in ipairs(self.results) do
        local cx = x + D.s(57) + (i - 1) * D.s(276)
        if cx + cover_w > x + w - D.s(60) then break end
        local cy = y + D.s(350)
        local cover = Books.cover(book, cover_w, cover_h)
        if cover then
            bb:blitFrom(cover, cx, cy + cover_h - cover:getHeight(), 0, 0, cover:getWidth(), cover:getHeight())
        else
            D.rect(bb, cx, cy, cover_w, cover_h, D.gray(204))
        end
        D.text(bb, cx, cy + cover_h + D.s(45), D.face("bold", 30), book.title, D.BLACK, cover_w)
        self:hit(cx, cy, cover_w, cover_h + D.s(60), function() self.shell.open_book(book.path) end)
    end
    D.rect(bb, x, y + D.s(862), w - D.s(127), D.s(2))
end

function Search:showInLibrary()
    local shell = self.shell
    shell.books = self.results
    shell.tab = "library"
    shell.page = 1
    self:close("flashui")
end

function Search:paintBookResults(bb, x, y, w, h)
    D.rect(bb, x, y + D.s(244), w, D.s(3), D.gray(170))
    local per_page = 6
    local total = #self.results
    D.text(bb, x + D.s(57), y + D.s(312), D.face("bold", 34),
        total == 0 and "No results in this book" or string.format("%d results in this book", total))
    local first = (self.page - 1) * per_page + 1
    for i = first, math.min(total, first + per_page - 1) do
        local item = self.results[i]
        local top = y + D.s(360 + (i - first) * 190)
        local before, after = item.prev_text or "", item.next_text or ""
        local gap_before = (before == "" or before:find("%s$")) and "" or " "
        local gap_after = (after == "" or after:find("^[%s%p]")) and "" or " "
        local snippet = before .. gap_before .. (item.matched_text or "") .. gap_after .. after
        local lines = D.wrap(D.face("regular", 32), snippet, w - D.s(180), 2)
        local baseline = top + D.s(40)
        for _, line in ipairs(lines) do
            textWithMatch(bb, x + D.s(57), baseline, line, item.matched_text or "", w - D.s(180))
            baseline = baseline + D.s(44)
        end
        local page = self.ui.document:getPageFromXPointer(item.start)
        D.text(bb, x + D.s(57), baseline + D.s(4), D.face("regular", 26), "Page " .. page, D.gray(85))
        D.rect(bb, x + D.s(39), top + D.s(176), w - D.s(170), D.s(2), D.gray(170))
        self:hit(x, top, w - D.s(110), D.s(180), function()
            self:close()
            self.ui.link:addCurrentLocationToStack()
            require("lexeme/backstack").jump(self.ui, function()
                self.ui:handleEvent(Event:new("GotoXPointer", item.start, item.start))
            end)
        end)
    end
    local pages = math.max(1, math.ceil(total / per_page))
    if pages > 1 then
        local up = self.page > 1 and "triangle-up" or "triangle-up-gray"
        D.icon(bb, up, x + w - D.s(74), y + D.s(380), D.s(34), D.s(21))
        D.icon(bb, self.page < pages and "triangle-down" or "triangle-down-gray", x + w - D.s(74), y + h - D.s(80),
            D.s(34), D.s(21))
        self:pressable(x + w - D.s(110), y + D.s(340), D.s(110), D.s(110), function() self:turn(-1, pages) end,
            D.around(x + w - D.s(57), y + D.s(390), D.s(101), D.s(101)))
        self:pressable(x + w - D.s(110), y + h - D.s(130), D.s(110), D.s(130), function() self:turn(1, pages) end,
            D.around(x + w - D.s(57), y + h - D.s(70), D.s(101), D.s(101)))
    end
end

function Search:turn(delta, pages)
    local page = math.max(1, math.min(pages, self.page + delta))
    if page == self.page then return end
    self.page = page
    self:refresh()
end

function Search:onSwipe(direction)
    if not self.results or self.mode ~= "book" then return end
    local pages = math.max(1, math.ceil(#self.results / 6))
    if direction == "north" then self:turn(1, pages) elseif direction == "south" then self:turn(-1, pages) end
    return true
end

function Search:onCloseWidget()
    if not self.shell then return end
    if self.shell.search == self then self.shell.search = nil end
    if not self.quiet then self.shell:refresh("flashui") end
end

-- Library search sits over Home; a book opened from it leaves it on screen until the book shows,
-- and it goes with Home (see Lexeme:onCloseWidget): left behind, it showed again for a moment
-- the next time a book opened, once Home had gone.
function Search.showLibrary(shell)
    local search = Search:new{ mode = "library", shell = shell }
    shell.search = search
    UIManager:show(search, "flashui")
end

function Search.showBook(ui)
    UIManager:show(Search:new{ mode = "book", ui = ui }, "flashui")
end

return Search
