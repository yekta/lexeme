-- Home and Library: the screens shown instead of KOReader's file browser.
local UIManager = require("ui/uimanager")

local Books = require("lexeme/books")
local D = require("lexeme/draw")
local LibrarySheets = require("lexeme/library_sheets")
local Menu = require("lexeme/menu")
local Quick = require("lexeme/quick")
local Status = require("lexeme/status")
local Streak = require("lexeme/streak")
local Sync = require("lexeme/sync")
local View = require("lexeme/view")

local Shell = View:extend{
    tab = "home",
    -- Called with a book path to open it.
    open_book = nil,
    -- Items of the ⋮ menu, built by main.lua.
    menu_items = nil,
    open_settings = nil,
}

local GRID = { x = 109, pitch_x = 357, top = 361, pitch_y = 632, cover_w = 310, cover_h = 512, cols = 3 }
local LIST = { top = 345, pitch = 265 }

local FILTERS = {
    { key = "in_progress", label = "In progress" },
    { key = "unread", label = "Unread" },
    { key = "read", label = "Read" },
}

function Shell:init()
    View.init(self)
    self.tab = G_reader_settings:readSetting("lexeme_tab") or "home"
    self.page = 1
    self.filters = { status = {}, kind = {} }
    self.sort = G_reader_settings:readSetting("lexeme_library_sort") or "recent"
    self.descending = G_reader_settings:nilOrTrue("lexeme_library_descending")
    self.layout = G_reader_settings:readSetting("lexeme_library_layout") or "grid"
    self:reload()
end

function Shell:reload()
    self.carousel_first, self.carousel_h = {}, {}
    self.all = Books.scan()
    self:query()
    Books.extractMissing(self.all, function()
        self.all = Books.scan()
        self:query()
        self:refresh()
    end)
end

-- Books on their way from Lexeme, shown first, as the Kindle shows a download.
local function deliveries()
    local list = {}
    for _, book in ipairs(require("lexeme/delivery").pending) do
        table.insert(list, {
            path = "lexeme-delivery:" .. book.id,
            title = book.title,
            delivery = book,
            added = os.time(),
            last_read = 0,
        })
    end
    return list
end

function Shell:query()
    self.books = Books.query(self.all, self.filters, self.sort, self.descending)
    for i, book in ipairs(deliveries()) do table.insert(self.books, i, book) end
end

function Shell:onLexemeLibraryChanged()
    self:reload()
    self:refresh()
end

function Shell:onLexemeStreakChanged()
    if self.tab == "home" then self:refresh() end
end

function Shell:setSort(sort, descending)
    self.sort, self.descending = sort, descending
    G_reader_settings:saveSetting("lexeme_library_sort", sort)
    G_reader_settings:saveSetting("lexeme_library_descending", descending)
    self.page = 1
    self:query()
    self:refresh()
end

function Shell:toggleFilter(group, key)
    local set = self.filters[group]
    set[key] = not set[key] or nil
    self.page = 1
    self:query()
    self:refresh()
end

function Shell:clearFilters()
    self.filters = { status = {}, kind = {} }
    self.page = 1
    self:query()
    self:refresh()
end

function Shell:hasFilters()
    return next(self.filters.status) ~= nil or next(self.filters.kind) ~= nil
end

function Shell:toggleRead(book)
    local BookList = require("ui/widget/booklist")
    local DocSettings = require("docsettings")
    local settings = DocSettings:open(book.path)
    local summary = settings:readSetting("summary") or {}
    summary.status = book.status == "complete" and "reading" or "complete"
    settings:saveSetting("summary", summary)
    settings:flush()
    BookList.resetBookInfoCache(book.path)
    self:reload()
    self:refresh()
end

function Shell:deleteBook(book)
    local settings = require("docsettings"):open(book.path)
    local key = settings:readSetting("partial_md5_checksum")
    if key then
        local Sync = require("lexeme/sync")
        Sync.queueReading{ removed_book_keys = { key } }
        Sync.soon()
    end
    -- Settings can be beside the book or in KOReader's folder; purge clears every copy.
    settings:purge()
    os.remove(book.path)
    require("readhistory"):removeItemByPath(book.path)
    self:reload()
    self:refresh()
end

function Shell:setTab(tab)
    self.tab = tab
    G_reader_settings:saveSetting("lexeme_tab", tab)
    self.page = 1
    self:refresh("flashui")
end

function Shell:onShowingReader()
    UIManager:close(self, "fast")
end

function Shell:onCloseWidget()
    Books.clearCovers()
end

function Shell:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w, function() self:openQuick() end)
    self:paintSearchRow(bb, x, y, w)
    if self.tab == "library" then
        self:paintLibrary(bb, x, y, w, h)
    else
        self:paintHome(bb, x, y, w, h)
    end
    self:paintTabs(bb, x, y, w, h)
end

function Shell:paintSearchRow(bb, x, y, w)
    local pill_w = w - D.s(36 + 122)
    D.border(bb, x + D.s(36), y + D.s(108), pill_w, D.s(101), D.s(2), D.BLACK, D.s(50))
    D.icon(bb, "search", x + D.s(86), y + D.s(136), D.s(42), D.s(42))
    D.text(bb, x + D.s(164), y + D.s(170), D.face("medium", 35), "Search Kindle")
    self:hit(x + D.s(36), y + D.s(108), pill_w, D.s(101), function() self:openSearch() end)

    local more_x = x + w - D.s(77)
    D.icon(bb, "ellipsis-vertical", more_x, y + D.s(139), D.s(38), D.s(38))
    self:hit(more_x - D.s(20), y + D.s(108), D.s(78), D.s(101), function()
        Menu:new{ items = self.menu_items(), right = x + w - D.s(37), top = y + D.s(215) }:show()
    end)
end

-- Library -------------------------------------------------------------------

function Shell:paintLibrary(bb, x, y, w, h)
    D.icon(bb, "settings-2", x + D.s(25), y + D.s(253), D.s(52), D.s(52))
    self:hit(x, y + D.s(240), D.s(90), D.s(80), function()
        LibrarySheets.FilterSheet:new{ shell = self }:show()
    end)
    local chip_x = x + D.s(93)
    local face = D.face("regular", 32)
    for _, filter in ipairs(FILTERS) do
        local chip_w = D.width(face, filter.label) + D.s(66)
        local selected = self.filters.status[filter.key] == true
        if selected then
            D.roundRect(bb, chip_x, y + D.s(241), chip_w, D.s(78), D.BLACK, D.s(39))
        else
            D.border(bb, chip_x, y + D.s(241), chip_w, D.s(78), D.s(2), D.BLACK, D.s(39))
        end
        D.text(bb, chip_x + D.s(33), y + D.s(291), face, filter.label, selected and D.WHITE or D.BLACK)
        self:hit(chip_x, y + D.s(241), chip_w, D.s(78), function() self:toggleFilter("status", filter.key) end)
        chip_x = chip_x + chip_w + D.s(15)
    end

    local layout_icon = self.layout == "grid" and "list" or "layout-grid"
    D.icon(bb, layout_icon, x + D.s(1112), y + D.s(257), D.s(47), D.s(47))
    self:hit(x + D.s(1095), y + D.s(240), D.s(80), D.s(80), function()
        self.layout = self.layout == "grid" and "list" or "grid"
        G_reader_settings:saveSetting("lexeme_library_layout", self.layout)
        self.page = 1
        self:refresh("flashui")
    end)
    D.icon(bb, "arrow-down-up", x + D.s(1193), y + D.s(253), D.s(55), D.s(55))
    self:hit(x + D.s(1180), y + D.s(240), D.s(85), D.s(80), function()
        LibrarySheets.SortSheet:new{ shell = self }:show()
    end)

    D.rect(bb, x, y + D.s(342), w, D.s(3), D.gray(119))

    local area_top, area_bottom = y + D.s(345), y + h - D.s(111)
    local area = bb:viewport(x, area_top, w, area_bottom - area_top)
    local per_page, pages
    if self.layout == "grid" then
        per_page = GRID.cols * 2
        pages = math.max(1, math.ceil(#self.books / per_page))
        self.page = math.min(self.page, pages)
        self:paintGrid(area, x, area_top, (self.page - 1) * per_page)
    else
        per_page = 4
        pages = math.max(1, math.ceil(#self.books / per_page))
        self.page = math.min(self.page, pages)
        self:paintList(area, x, area_top, w, (self.page - 1) * per_page)
    end
    self:paintScrollbar(bb, x + w, area_top, area_bottom, pages)

    if #self.books == 0 then
        D.textCenter(bb, x + w / 2, y + D.s(800), D.face("regular", 36),
            self:hasFilters() and "No books match these filters." or "No books found in " .. Books.homeDir())
    end
end

-- Covers are painted into `area`, a viewport whose origin is (ox, oy) on screen.
function Shell:paintCover(area, ox, oy, book, cx, cy, cw, ch, with_menu)
    if book.delivery then
        local dh = math.min(ch, math.floor(cw * 1.5 + 0.5))
        local dy = cy + ch - dh
        D.rect(area, cx - ox, dy - oy, cw, dh, D.gray(102))
        local icon = math.floor(cw * 0.17)
        D.icon(area, "book", cx - ox + math.floor((cw - icon) / 2), dy - oy + math.floor((dh - icon) / 2), icon, icon)
        D.border(area, cx - ox - D.s(2), dy - oy - D.s(2), cw + D.s(4), dh + D.s(4), D.s(2), D.gray(102))
        return cx, dy, cw, dh
    end
    local cover = Books.cover(book, cw, ch)
    local dx, dy, dw, dh
    if cover then
        dw, dh = cover:getWidth(), cover:getHeight()
        dx, dy = cx + math.floor((cw - dw) / 2), cy + ch - dh
        area:blitFrom(cover, dx - ox, dy - oy, 0, 0, dw, dh)
    else
        -- The Kindle's cover for a book without one: 2:3, a white band with a
        -- book icon, then the title and author on grey. Scaled from its
        -- 287 px wide version.
        local k = cw / D.s(287)
        dw = cw
        dh = math.min(ch, math.floor(cw * 1.5 + 0.5))
        dx, dy = cx, cy + ch - dh
        local band = math.floor(dh * 0.195)
        D.rect(area, dx - ox, dy - oy, dw, dh, D.WHITE)
        D.rect(area, dx - ox, dy - oy + band, dw, dh - band, D.gray(204))
        local icon = math.floor(D.s(48) * k)
        D.icon(area, "book", dx - ox + math.floor(D.s(12) * k), dy - oy + math.floor(D.s(14) * k), icon, icon)
        local title_face = D.face("bold", math.max(12, math.floor(31 * k)))
        local author_face = D.face("regular", math.max(12, math.floor(31 * k)))
        local inset = math.floor(D.s(21) * k)
        local pitch = math.floor(D.s(42) * k)
        local line_y = dy - oy + band + math.floor(D.s(47) * k)
        for _, line in ipairs(D.wrap(title_face, book.title, dw - 2 * inset, 4)) do
            D.text(area, dx - ox + inset, line_y, title_face, line)
            line_y = line_y + pitch
        end
        if book.authors then
            D.text(area, dx - ox + inset, line_y - math.floor(D.s(2) * k), author_face, book.authors, D.BLACK,
                dw - 2 * inset)
        end
    end
    D.border(area, dx - ox - D.s(2), dy - oy - D.s(2), dw + D.s(4), dh + D.s(4), D.s(2), D.gray(102))
    if self.opening == book.path then
        local band = math.min(D.s(70), dh)
        local by = dy - oy + dh + D.s(2) - band
        D.rect(area, dx - ox - D.s(2), by, dw + D.s(4), band)
        D.textCenter(area, dx - ox + math.floor(dw / 2), by + D.s(44), D.face("regular", 29), "Opening", D.WHITE)
        return dx, dy, dw, dh
    end
    if with_menu then
        D.icon(area, "cover-menu", dx - ox + dw - D.s(29), dy - oy + dh - D.s(60), D.s(13), D.s(49))
    end
    return dx, dy, dw, dh
end

function Shell:paintBadge(area, ox, oy, book, bx, baseline)
    local face = D.face("medium", 29)
    if book.delivery then
        local percent = book.delivery.percent
        local label = percent and ("Downloading - " .. percent .. "%") or "Queued"
        D.text(area, bx - ox, baseline - oy, D.face("regular", 30), label)
    elseif book.status == "new" then
        local bw = D.width(face, "New") + D.s(16)
        D.roundRect(area, bx - ox, baseline - oy - D.s(31), bw, D.s(44), D.BLACK, D.s(6))
        D.text(area, bx - ox + D.s(8), baseline - oy, face, "New", D.WHITE)
    elseif book.status == "complete" then
        local bw = D.width(face, "Read") + D.s(16)
        D.border(area, bx - ox, baseline - oy - D.s(31), bw, D.s(44), D.s(2), D.BLACK, D.s(8))
        D.text(area, bx - ox + D.s(8), baseline - oy, face, "Read")
    elseif book.percent then
        D.text(area, bx - ox, baseline - oy, D.face("regular", 30), math.floor(book.percent * 100 + 0.5) .. "%")
    end
end

function Shell:paintGrid(area, ox, oy, first)
    for i = 0, GRID.cols * 3 - 1 do
        local book = self.books[first + i + 1]
        if not book then break end
        local col, row = i % GRID.cols, math.floor(i / GRID.cols)
        local cx = ox + D.s(GRID.x + col * GRID.pitch_x)
        local cy = oy + D.s(GRID.top - 345 + row * GRID.pitch_y)
        self:paintCover(area, ox, oy, book, cx, cy, D.s(GRID.cover_w), D.s(GRID.cover_h), true)
        self:paintBadge(area, ox, oy, book, cx, cy + D.s(GRID.cover_h + 41))
        if row < 2 then
            self:hit(cx, cy, D.s(GRID.cover_w), D.s(GRID.cover_h + 60),
                function() self.open_book(book.path) end,
                function() self:openBookMenu(book, cx + D.s(GRID.cover_w), cy + D.s(GRID.cover_h)) end)
            local menu_x = cx + D.s(GRID.cover_w - 50)
            self:hit(menu_x, cy + D.s(GRID.cover_h - 80), D.s(60), D.s(80),
                function() self:openBookMenu(book, cx + D.s(GRID.cover_w), cy + D.s(GRID.cover_h)) end)
        end
    end
end

function Shell:paintList(area, ox, oy, w, first)
    local title_face, author_face = D.face("bold", 32), D.face("regular", 30)
    for i = 0, 4 do
        local book = self.books[first + i + 1]
        if not book then break end
        local top = oy + D.s(i * LIST.pitch)
        local cx, cy, cw, ch = ox + D.s(36), top + D.s(31), D.s(150), D.s(220)
        self:paintCover(area, ox, oy, book, cx, cy, cw, ch, false)
        local tx = ox + D.s(225)
        local baseline = top + D.s(75)
        for _, line in ipairs(D.wrap(title_face, book.title, w - D.s(225 + 130), 2)) do
            D.text(area, tx - ox, baseline - oy, title_face, line)
            baseline = baseline + D.s(40)
        end
        if book.authors then
            D.text(area, tx - ox, baseline - oy, author_face, book.authors, D.BLACK, w - D.s(225 + 130))
            baseline = baseline + D.s(40)
        end
        self:paintBadge(area, ox, oy, book, tx, baseline + D.s(4))
        D.icon(area, "ellipsis-vertical", ox + w - D.s(177) - ox, top - oy + D.s(36), D.s(38), D.s(38))
        D.rect(area, D.s(36), top - oy + D.s(LIST.pitch) - D.s(2), w - D.s(36 + 122), D.s(2))
        if i < 4 then
            self:hit(ox, top, w - D.s(120), D.s(LIST.pitch),
                function() self.open_book(book.path) end,
                function() self:openBookMenu(book, ox + w - D.s(120), top + D.s(120)) end)
            self:hit(ox + w - D.s(200), top, D.s(80), D.s(120),
                function() self:openBookMenu(book, ox + w - D.s(120), top + D.s(120)) end)
        end
    end
end

function Shell:paintScrollbar(bb, right, top, bottom, pages)
    local up = self.page > 1
    local down = self.page < pages
    D.icon(bb, up and "triangle-up" or "triangle-up-gray", right - D.s(74), top + D.s(42), D.s(34), D.s(21))
    D.icon(bb, down and "triangle-down" or "triangle-down-gray", right - D.s(75), bottom - D.s(68), D.s(34), D.s(21))
    local track_top, track_bottom = top + D.s(103), bottom - D.s(109)
    local track_x = right - D.s(63)
    for ty = track_top, track_bottom, D.s(4) do
        D.rect(bb, track_x + D.s(3), ty, D.s(4), D.s(2), D.gray(102))
    end
    local span = track_bottom - track_top
    local thumb_h = math.max(D.s(40), math.floor(span / pages))
    local thumb_y = track_top + math.floor((span - thumb_h) * (self.page - 1) / math.max(1, pages - 1))
    D.roundRect(bb, track_x, thumb_y, D.s(10), thumb_h, D.BLACK, D.s(5))
    self:hit(right - D.s(100), top, D.s(100), D.s(110), function() self:turnPage(-1, pages) end)
    self:hit(right - D.s(100), bottom - D.s(110), D.s(100), D.s(110), function() self:turnPage(1, pages) end)
end

function Shell:turnPage(delta, pages)
    local page = math.max(1, math.min(pages or math.huge, self.page + delta))
    if page == self.page then return end
    self.page = page
    self:refresh()
end

function Shell:openQuick()
    Quick:new{ open_settings = self.open_settings }:show()
end

-- Swiped left or right on a row of covers: the next or previous screenful, as on the Kindle.
function Shell:scrollCarousel(direction, y)
    if direction ~= "west" and direction ~= "east" then return end
    for _, row in ipairs(self.carousels or {}) do
        if y >= row.top and y <= row.bottom then
            local first = self.carousel_first[row.title] or 1
            local last_first = math.max(1, row.count - row.step + 1)
            local moved = direction == "west" and math.min(first + row.step, last_first) or math.max(1, first - row.step)
            if moved ~= first then
                self.carousel_first[row.title] = moved
                self:refresh()
            end
            return true
        end
    end
end

function Shell:onSwipe(direction, ges)
    if direction == "south" and ges.pos.y < D.s(200) then
        self:openQuick()
        return true
    end
    if self.tab == "home" then return self:scrollCarousel(direction, ges.pos.y) end
    if self.tab ~= "library" then return end
    if direction == "north" or direction == "west" then
        self:turnPage(1, self:pageCount())
    elseif direction == "south" or direction == "east" then
        self:turnPage(-1)
    end
    return true
end

function Shell:pageCount()
    local per_page = self.layout == "grid" and GRID.cols * 2 or 4
    return math.max(1, math.ceil(#self.books / per_page))
end

-- Home ------------------------------------------------------------------------

-- A titled row of covers. As on the Kindle, covers share a bottom edge and the
-- row is as tall as its tallest cover, and it scrolls sideways when swiped.
-- Returns the y where the row ends.
local function paintCarousel(self, bb, x, top, w, title, books, on_more)
    local first = math.min(self.carousel_first[title] or 1, math.max(1, #books))
    D.text(bb, x + D.s(57), top + D.s(58), D.face("display", 55), title)
    if on_more then
        D.icon(bb, "chevron-right-thin", x + D.s(1105), top - D.s(7), D.s(80), D.s(80))
        self:hit(x, top - D.s(30), w, D.s(110), on_more)
    end
    local cell_w, max_h = D.s(287), D.s(480)
    local visible, whole = {}, 0
    for i = first, #books do
        local cx = x + D.s(36) + (i - first) * D.s(316)
        if cx > x + w - D.s(116) then break end
        if cx + cell_w <= x + w - D.s(116) then whole = whole + 1 end
        table.insert(visible, { book = books[i], cx = cx })
    end
    -- Swiping to shorter covers keeps the row's height, so what's below doesn't move.
    local row_h = self.carousel_h[title] or 0
    for _, item in ipairs(visible) do
        local cover = Books.cover(item.book, cell_w, max_h)
        row_h = math.max(row_h, cover and cover:getHeight() or max_h)
    end
    self.carousel_h[title] = row_h
    local cover_top = top + D.s(100)
    table.insert(self.carousels, {
        title = title, top = top - D.s(30), bottom = cover_top + row_h + D.s(60),
        count = #books, step = math.max(1, whole),
    })
    local area = bb:viewport(x, cover_top - D.s(10), w - D.s(116), row_h + D.s(90))
    local ox, oy = x, cover_top - D.s(10)
    for _, item in ipairs(visible) do
        local book, cx = item.book, item.cx
        local dx, dy, dw, dh = self:paintCover(area, ox, oy, book, cx, cover_top, cell_w, row_h, true)
        self:paintBadge(area, ox, oy, book, cx, cover_top + row_h + D.s(41))
        self:hit(cx, cover_top, cell_w, row_h + D.s(60),
            function() self.open_book(book.path) end,
            function() self:openBookMenu(book) end)
        self:hit(dx + dw - D.s(60), dy + dh - D.s(80), D.s(60), D.s(80), function() self:openBookMenu(book) end)
    end
    return cover_top + row_h + D.s(55)
end

-- Every other weekday is named, as there is no room for all seven.
local WEEKDAYS = { "Mon", "", "Wed", "", "Fri", "", "" }

-- "1 h 20 min", "2 h", "45 min", as Lexeme writes reading time.
local function readingTime(seconds)
    local minutes = math.floor(seconds / 60 + 0.5)
    local hours, rest = math.floor(minutes / 60), minutes % 60
    if hours == 0 then return string.format("%d min", minutes) end
    if rest == 0 then return string.format("%d h", hours) end
    return string.format("%d h %d min", hours, rest)
end

local function count(n, one, many)
    return string.format("%d %s", n, n == 1 and one or many)
end

-- The reading below the covers lines up with the first cover's left edge, the same in from the right.
local HOME_MARGIN = 34

-- The same six figures as Lexeme's reading page, three to a row. Returns the y where they end.
local function paintTiles(bb, x, top, w, reading)
    local tiles = {
        { "Today", readingTime(reading.today) },
        { "This week", readingTime(reading.week) },
        { "Total", readingTime(reading.total) },
        { "Streak", count(reading.streak, "day", "days") },
        { "Finished in " .. reading.year, count(reading.finished_this_year, "book", "books") },
        { "Finished", count(reading.finished, "book", "books") },
    }
    local per_row, gap, h = 3, D.s(18), D.s(128)
    local left, right = x + D.s(HOME_MARGIN), x + w - D.s(HOME_MARGIN)
    -- Whole-pixel widths leave pixels over; they go between tiles so the last ends at `right`.
    local function tileX(column) return left + math.floor(column * (right - left + gap) / per_row + 0.5) end
    for i, tile in ipairs(tiles) do
        local column, row = (i - 1) % per_row, math.floor((i - 1) / per_row)
        local tx, ty = tileX(column), top + row * (h + gap)
        local tile_w = tileX(column + 1) - gap - tx
        D.border(bb, tx, ty, tile_w, h, D.s(3), D.BLACK)
        D.text(bb, tx + D.s(24), ty + D.s(48), D.face("regular", 28), tile[1], D.BLACK, tile_w - D.s(48))
        D.text(bb, tx + D.s(24), ty + D.s(102), D.face("bold", 36), tile[2], D.BLACK, tile_w - D.s(48))
    end
    local rows = math.ceil(#tiles / per_row)
    return top + rows * h + (rows - 1) * gap
end

-- The last year as a grid of days, a week to a column, like Lexeme's streak calendar.
local function paintCalendar(bb, x, top, w, bottom, days, goal_minutes)
    local goal, reached = goal_minutes * 60, 0
    for _, day in ipairs(days) do
        if day.seconds >= goal then reached = reached + 1 end
    end
    local small = D.face("regular", 22)
    D.text(bb, x + D.s(HOME_MARGIN), top + D.s(30), D.face("regular", 28),
        string.format("%s of %d min+", count(reached, "day", "days"), goal_minutes))

    local y, m, d = days[1].day:match("^(%d+)-(%d+)-(%d+)$")
    local first = os.time{ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 }
    local lead = (os.date("*t", first).wday + 5) % 7
    local columns = math.ceil((lead + #days) / 7)
    local label_w = 0
    for _, name in ipairs(WEEKDAYS) do label_w = math.max(label_w, D.width(small, name)) end
    local left = x + D.s(HOME_MARGIN) + label_w + D.s(14)
    local gap, right = D.s(4), x + w - D.s(HOME_MARGIN)
    local cell = math.floor((right - left + gap) / columns) - gap
    -- Whole-pixel cells leave pixels over; they go between columns so the grid ends where the tiles do.
    local function columnX(column)
        return left + math.floor(column * (right - left - cell) / (columns - 1) + 0.5)
    end
    local grid_top = top + D.s(90)
    -- Days stretch down to `bottom`, so the calendar fills what Home has left.
    local row_pitch = math.max(cell + gap, math.floor((bottom - grid_top + gap) / 7))
    local cell_h = row_pitch - gap

    for row, name in ipairs(WEEKDAYS) do
        if name ~= "" then
            D.text(bb, x + D.s(HOME_MARGIN), grid_top + (row - 1) * row_pitch + math.floor(cell_h / 2) + D.s(8), small, name)
        end
    end
    local months, last_month = {}, nil
    for i, day in ipairs(days) do
        local column = math.floor((lead + i - 1) / 7)
        local month = day.day:sub(1, 7)
        if month ~= last_month then
            months[column] = os.date("%b", first + (i - 1) * 86400)
            last_month = month
        end
        D.rect(bb, columnX(column), grid_top + ((lead + i - 1) % 7) * row_pitch, cell, cell_h,
            day.seconds >= goal and D.BLACK or D.gray(0xDD))
    end
    -- A month's name is left out where the next one would touch it.
    for column, name in pairs(months) do
        if not (months[column + 1] or months[column + 2]) and columnX(column) + D.width(small, name) <= x + w then
            D.text(bb, columnX(column), grid_top - D.s(14), small, name)
        end
    end
end

function Shell:paintHome(bb, x, y, w, h)
    self.carousels = {}
    local recent = Books.query(self.all, nil, "recent", true)
    if #recent == 0 then
        D.textCenter(bb, x + w / 2, y + D.s(800), D.face("regular", 36), "No books found in " .. Books.homeDir())
        return
    end
    local bottom = paintCarousel(self, bb, x, y + D.s(243), w, "From Your Library", recent,
        function() self:setTab("library") end)
    if not G_reader_settings:nilOrTrue("lexeme_home_recently_added") then return end
    -- The next heading's baseline sits 94 px under the badges, as on the Kindle.
    local next_top = bottom + D.s(94 - 58)
    local reading = Sync.isConnected() and Streak.summary()
    if reading then
        local tiles_bottom = paintTiles(bb, x, next_top + D.s(20), w, reading)
        -- Clear of the tab bar and the cover of the book being read, which stands above it.
        local bottom = y + h - D.s(111) - D.s(70)
        return paintCalendar(bb, x, tiles_bottom + D.s(56), w, bottom, reading.days, reading.goal_minutes)
    end
    paintCarousel(self, bb, x, next_top, w, "Recently Added", Books.query(self.all, nil, "added", true), nil)
end

-- Bottom tabs -------------------------------------------------------------------

function Shell:paintTabs(bb, x, y, w, h)
    local line_y = y + h - D.s(111)
    D.rect(bb, x, line_y, w, D.s(5))
    local face = D.face("bold", 36)
    local tabs = {
        { key = "home", label = "Home", center = 300 },
        { key = "library", label = "Library", center = 974 },
    }
    for _, tab in ipairs(tabs) do
        local cx = x + D.s(tab.center)
        D.textCenter(bb, cx, line_y + D.s(65), face, tab.label)
        if self.tab == tab.key then
            D.rect(bb, cx - D.s(43), line_y + D.s(80), D.s(86), D.s(5))
        end
        self:hit(cx - D.s(200), line_y, D.s(400), D.s(111), function() self:setTab(tab.key) end)
    end

    local last = Books.lastOpened()
    if last then
        local book
        for _, b in ipairs(self.all) do
            if b.path == last then book = b break end
        end
        if book then
            local mw, mh = D.s(95), D.s(130)
            local mx, my = x + math.floor((w - mw) / 2), line_y - D.s(42)
            D.rect(bb, mx - D.s(2), my - D.s(2), mw + D.s(4), mh + D.s(4), D.WHITE)
            local cover = Books.cover(book, mw, mh)
            if cover then
                bb:blitFrom(cover, mx + math.floor((mw - cover:getWidth()) / 2), my + mh - cover:getHeight(),
                    0, 0, cover:getWidth(), cover:getHeight())
            end
            D.border(bb, mx - D.s(2), my - D.s(2), mw + D.s(4), mh + D.s(4), D.s(2))
            self:hit(mx, my, mw, mh + D.s(40), function() self.open_book(book.path) end)
        end
    end
end

-- Menus ---------------------------------------------------------------------------

function Shell:openBookMenu(book)
    if book.delivery then return end
    LibrarySheets.BookSheet:new{ shell = self, book = book }:show()
end

function Shell:openSearch()
    require("lexeme/search").showLibrary(self)
end

return Shell
