-- The library's bottom sheets: Sort by, Filters, and a book's actions.
local UIManager = require("ui/uimanager")

local Books = require("lexeme/books")
local D = require("lexeme/draw")
local Dialog = require("lexeme/dialog")
local Sheet = require("lexeme/sheet")

local M = {}

M.SORTS = {
    { key = "recent", label = "Most recent", descending = true },
    { key = "title", label = "Title" },
    { key = "author", label = "Author (surname)" },
    { key = "added", label = "Date added", descending = true },
}

local function title(bb, x, top, w, text)
    D.text(bb, x + D.s(61), top + D.s(138), D.face("bold", 37), text)
    D.rect(bb, x + D.s(5), top + D.s(164), w - D.s(12), D.s(4))
end

-- Lays chips out left to right, wrapping to a new row when they don't fit.
local function chipRows(view, bb, x, y, w, chips)
    local cx, cy = x + D.s(59), y
    for _, chip in ipairs(chips) do
        local face = D.face("regular", 32)
        local cw = D.width(face, chip.label) + D.s(66)
        if cx + cw > x + w - D.s(40) then
            cx, cy = x + D.s(59), cy + D.s(94)
        end
        Sheet.chip(view, bb, cx, cy, chip.label, chip.selected, chip.enabled, chip.on_tap)
        cx = cx + cw + D.s(15)
    end
    return cy + D.s(79)
end

-- Sort by -----------------------------------------------------------------------

M.SortSheet = Sheet:extend{
    shell = nil,
    height = 472,
}

function M.SortSheet:renderContent(bb, x, top, w)
    local shell = self.shell
    title(bb, x, top, w, "Sort by")
    local chips = {}
    for _, sort in ipairs(M.SORTS) do
        table.insert(chips, {
            label = sort.label,
            selected = shell.sort == sort.key,
            on_tap = function()
                shell:setSort(sort.key, sort.descending == true)
                self:refresh()
            end,
        })
    end
    chipRows(self, bb, x, top + D.s(204), w, chips)
    D.rect(bb, x + D.s(41), top + D.s(311), w - D.s(84), D.s(2), D.gray(136))
    chipRows(self, bb, x, top + D.s(357), w, {
        { label = "Ascending", selected = not shell.descending, on_tap = function()
            shell:setSort(shell.sort, false)
            self:refresh()
        end },
        { label = "Descending", selected = shell.descending, on_tap = function()
            shell:setSort(shell.sort, true)
            self:refresh()
        end },
    })
end

-- Filters -------------------------------------------------------------------------

local FILTER_GROUPS = {
    {
        group = "status",
        label = "Reading status",
        values = { { key = "read", label = "Read" }, { key = "in_progress", label = "In progress" },
            { key = "unread", label = "Unread" } },
    },
    {
        group = "kind",
        label = "Content type",
        values = { { key = "books", label = "Books" }, { key = "documents", label = "Documents" },
            { key = "comics", label = "Comics" } },
    },
}

M.FilterSheet = Sheet:extend{
    shell = nil,
    height = 1696 - 738,
}

function M.FilterSheet:renderContent(bb, x, top, w)
    local shell = self.shell
    D.text(bb, x + D.s(42), top + D.s(160), D.face("bold", 40), "Filters")
    local clear_face = D.face("regular", 32)
    local clear_w = D.width(clear_face, "Clear all")
    local clear_x = x + w - D.s(76) - clear_w
    D.text(bb, clear_x, top + D.s(150), clear_face, "Clear all")
    D.rect(bb, clear_x, top + D.s(158), clear_w, D.s(2))
    self:hit(clear_x - D.s(20), top + D.s(100), clear_w + D.s(40), D.s(80), function()
        shell:clearFilters()
        self:refresh()
    end)
    D.rect(bb, x + D.s(5), top + D.s(205), w - D.s(12), D.s(3))

    local y = top + D.s(208)
    for i, group in ipairs(FILTER_GROUPS) do
        D.text(bb, x + D.s(42), y + D.s(77), D.face("bold", 34), group.label)
        local chips = {}
        for _, value in ipairs(group.values) do
            local count = Books.count(shell.all, group.group, value.key)
            table.insert(chips, {
                label = value.label .. " (" .. count .. ")",
                selected = shell.filters[group.group][value.key] == true,
                enabled = count > 0,
                on_tap = function()
                    shell:toggleFilter(group.group, value.key)
                    self:refresh()
                end,
            })
        end
        y = chipRows(self, bb, x, y + D.s(115), w, chips) + D.s(38)
        if i < #FILTER_GROUPS then
            D.rect(bb, x + D.s(5), y, w - D.s(12), D.s(2), D.gray(136))
        end
    end
end

-- A book's actions ------------------------------------------------------------------

M.BookSheet = Sheet:extend{
    shell = nil,
    book = nil,
}

local ITEM_PITCH = 118

function M.BookSheet:items()
    local shell, book = self.shell, self.book
    return {
        { text = "Open", callback = function() shell.open_book(book.path) end },
        {
            text = book.status == "complete" and "Mark as unread" or "Mark as read",
            callback = function() shell:toggleRead(book) end,
        },
        {
            text = "About this book",
            callback = function()
                require("lexeme/about").show(book.path)
            end,
        },
        {
            text = "Permanently delete",
            callback = function()
                Dialog:new{
                    title = "Permanently delete?",
                    message = "“" .. book.title .. "” will be deleted from this Kindle. This can't be undone.",
                    ok_text = "Delete",
                    on_ok = function() shell:deleteBook(book) end,
                }:show()
            end,
        },
    }
end

function M.BookSheet:init()
    self.height = 360 + #self:items() * ITEM_PITCH
    Sheet.init(self)
end

function M.BookSheet:renderContent(bb, x, top, w)
    local book = self.book
    local cover_x, cover_y, cover_w, cover_h = x + D.s(43), top + D.s(104), D.s(140), D.s(232)
    local cover = Books.cover(book, cover_w, cover_h)
    if cover then
        local dx = cover_x + math.floor((cover_w - cover:getWidth()) / 2)
        bb:blitFrom(cover, dx, cover_y, 0, 0, cover:getWidth(), cover:getHeight())
        D.border(bb, dx, cover_y, cover:getWidth(), cover:getHeight(), D.s(2), D.gray(102))
    else
        D.rect(bb, cover_x, cover_y, cover_w, cover_h, D.gray(204))
    end
    local tx, tw = x + D.s(213), w - D.s(213 + 30)
    local baseline = top + D.s(126)
    for _, line in ipairs(D.wrap(D.face("bold", 32), book.title, tw, 2)) do
        D.text(bb, tx, baseline, D.face("bold", 32), line)
        baseline = baseline + D.s(42)
    end
    if book.authors then
        D.text(bb, tx, baseline + D.s(8), D.face("regular", 32), book.authors, D.BLACK, tw)
        baseline = baseline + D.s(50)
    end
    if book.percent then
        D.text(bb, tx, baseline + D.s(8), D.face("regular", 28), math.floor(book.percent * 100 + 0.5) .. "%")
    end

    local line_y = top + D.s(360)
    for _, item in ipairs(self:items()) do
        D.rect(bb, x + D.s(5), line_y, w - D.s(12), D.s(4))
        D.text(bb, x + D.s(43), line_y + D.s(72), D.face("regular", 34), item.text)
        self:hit(x, line_y + D.s(4), w, D.s(ITEM_PITCH - 4), function()
            self:close()
            UIManager:nextTick(item.callback)
        end)
        line_y = line_y + D.s(ITEM_PITCH)
    end
end

return M
