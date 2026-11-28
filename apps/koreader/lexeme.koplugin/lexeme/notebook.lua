-- The notebook: the book's highlights, notes and bookmarks, grouped by chapter.
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Menu = require("lexeme/menu")
local Scrollbar = require("lexeme/scrollbar")
local Status = require("lexeme/status")
local View = require("lexeme/view")

local Notebook = View:extend{
    ui = nil,
}

local FILTERS = {
    { key = "all", label = "All annotations" },
    { key = "highlight", label = "Highlights" },
    { key = "note", label = "Notes" },
    { key = "bookmark", label = "Bookmarks" },
}

local function kind(item)
    if not item.drawer then return "bookmark" end
    if item.note then return "note" end
    return "highlight"
end

local function capitalize(text)
    return (text:gsub("^%l", string.upper))
end

function Notebook:init()
    View.init(self)
    self.filter = "all"
    self.first = 1
end

function Notebook:items()
    local items = {}
    for index, item in ipairs(self.ui.annotation.annotations or {}) do
        if self.filter == "all" or kind(item) == self.filter then
            table.insert(items, { index = index, item = item })
        end
    end
    return items
end

function Notebook:pageLabel(item)
    if require("lexeme/footer").mode() == "location" then
        local Locations = require("lexeme/locations")
        local location = Locations.ofAnnotation(self.ui, item)
        if location then return "Location " .. Locations.format(location) end
    end
    return "Page " .. self.ui.bookmark:getBookmarkPageString(item.page)
end

function Notebook:typeLabel(item)
    local k = kind(item)
    if k == "bookmark" then return "Bookmark" end
    local label = k == "note" and "Note" or "Highlight"
    if item.color then label = label .. " (" .. capitalize(item.color) .. ")" end
    return label
end

-- Height of one entry, in screen pixels, and the wrapped lines it shows.
function Notebook:layoutEntry(entry, w, with_chapter)
    local item = entry.item
    local h = D.s(70)
    if with_chapter then h = h + D.s(70) end
    local lines = item.text and D.wrap(D.face("regular", 30), item.text, w - D.s(250), 4) or {}
    local note_lines = item.note and D.wrap(D.face("italic", 28), item.note, w - D.s(250), 3) or {}
    h = h + #lines * D.s(42) + #note_lines * D.s(40) + D.s(50)
    return h, lines, note_lines
end

function Notebook:render(bb, x, y, w, h)
    self.scrollbar = nil
    Status.paint(self, bb, x, y, w)
    D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
    self:pressable(x, y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(7), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    local title = self.ui.doc_props and self.ui.doc_props.display_title or ""
    D.text(bb, x + D.s(139), y + D.s(168), D.face("bold", 34), title, D.BLACK, w - D.s(180))
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))

    D.icon(bb, "settings-2", x + D.s(28), y + D.s(254), D.s(44), D.s(44))
    if self.filter ~= "all" then
        for _, f in ipairs(FILTERS) do
            if f.key == self.filter then D.text(bb, x + D.s(96), y + D.s(288), D.face("regular", 30), f.label) end
        end
    end
    self:pressable(x, y + D.s(220), D.s(500), D.s(115), function() self:openFilter() end,
        { x = x + D.s(7), y = y + D.s(234), w = D.s(86), h = D.s(86) })
    D.rect(bb, x, y + D.s(336), w, D.s(4))

    local items = self:items()
    local top, bottom = y + D.s(360), y + h - D.s(40)
    if #items == 0 then
        local message = "You haven't made any annotations. Any annotations you make will be collected here."
        local line_y = top + D.s(80)
        for _, line in ipairs(D.wrap(D.face("regular", 30), message, w - D.s(220), 3)) do
            D.text(bb, x + D.s(108), line_y, D.face("regular", 30), line)
            line_y = line_y + D.s(40)
        end
        return
    end

    self.first = math.max(1, math.min(self.first, #items))
    -- Entries leave the right edge to the scrollbar.
    local cw = w - D.s(100)
    local previous_chapter = self.first > 1 and items[self.first - 1].item.chapter or nil
    local last = self.first - 1
    for i = self.first, #items do
        local entry = items[i]
        local item = entry.item
        local with_chapter = item.chapter ~= previous_chapter
        local entry_h, lines, note_lines = self:layoutEntry(entry, cw, with_chapter)
        if top + entry_h > bottom then break end
        local line_y = top
        if with_chapter then
            D.text(bb, x + D.s(108), line_y + D.s(55), D.face("bold", 32), item.chapter or "", D.BLACK, cw - D.s(200))
            line_y = line_y + D.s(70)
        end
        local meta_face = D.face("bold", 28)
        local page = self:pageLabel(item)
        local pw = D.text(bb, x + D.s(108), line_y + D.s(50), meta_face, page)
        D.rect(bb, x + D.s(108), line_y + D.s(57), pw, D.s(2))
        D.text(bb, x + D.s(108) + pw, line_y + D.s(50), meta_face, " | " .. self:typeLabel(item))
        D.icon(bb, "ellipsis-vertical", x + cw - D.s(100), line_y + D.s(16), D.s(40), D.s(40))
        self:pressable(x + cw - D.s(140), line_y, D.s(140), D.s(80), function()
            self:openItemMenu(entry, x + cw - D.s(60), line_y + D.s(80))
        end, D.around(x + cw - D.s(80), line_y + D.s(36), D.s(86), D.s(86)))
        line_y = line_y + D.s(70)
        if #lines > 0 then
            D.rect(bb, x + D.s(108), line_y + D.s(4), D.s(10), #lines * D.s(42) - D.s(8))
            for _, line in ipairs(lines) do
                D.text(bb, x + D.s(140), line_y + D.s(32), D.face("regular", 30), line)
                line_y = line_y + D.s(42)
            end
        end
        for _, line in ipairs(note_lines) do
            D.text(bb, x + D.s(140), line_y + D.s(34), D.face("italic", 28), line)
            line_y = line_y + D.s(40)
        end
        self:hit(x, top, cw - D.s(140), entry_h, function() self:goTo(item) end)
        top = top + entry_h
        previous_chapter = item.chapter
        last = i
    end

    if last == #items and top + D.s(120) < bottom then
        D.rect(bb, x + D.s(108), top, cw - D.s(130), D.s(4))
        D.text(bb, x + D.s(108), top + D.s(65), D.face("bold", 32), "End of annotations")
    end
    self.last, self.count = last, #items
    Scrollbar.paint(self, bb, x + w, y + D.s(340), y + h - D.s(30), { at = self.first, last = last, count = #items,
        go = function(first) self:showFrom(first) end })
end

function Notebook:goTo(item)
    self:close("flashui")
    self.ui.link:addCurrentLocationToStack()
    require("lexeme/backstack").jump(self.ui, function() self.ui.bookmark:gotoBookmark(item.page, item.pos0) end)
end

function Notebook:openFilter()
    local items = {}
    for _, f in ipairs(FILTERS) do
        table.insert(items, { text = f.label, callback = function()
            self.filter = f.key
            self.first = 1
            self:refresh()
        end })
    end
    Menu:new{ items = items, left = D.s(20), top = D.s(320) }:show()
end

function Notebook:openItemMenu(entry, right, top)
    local items = {
        {
            text = entry.item.note and "Edit note" or "Add note",
            callback = function()
                self:close()
                self.ui.bookmark:setBookmarkNote(entry.index, not entry.item.note)
            end,
        },
        {
            text = "Delete",
            callback = function()
                self.ui.bookmark:removeItemByIndex(entry.index)
                self:refresh()
            end,
        },
    }
    Menu:new{ items = items, right = right, top = top }:show()
end

function Notebook:showFrom(first)
    first = math.max(1, math.min(self.count or 1, first))
    if first == self.first then return end
    self.first = first
    self:refresh()
end

function Notebook:onSwipe(direction, ges)
    if Scrollbar.onSwipe(self, ges) then return true end
    if not self.last then return true end
    if direction == "north" and self.last < self.count then
        self:showFrom(self.last + 1)
    elseif direction == "south" then
        self:showFrom(self.first - math.max(1, self.last - self.first + 1))
    end
    return true
end

function Notebook.show(ui)
    UIManager:show(Notebook:new{ ui = ui }, "flashui")
end

Scrollbar.extend(Notebook)

return Notebook
