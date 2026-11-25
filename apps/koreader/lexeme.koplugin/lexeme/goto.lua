-- The Go To panel: book title, "Go to page", and the table of contents.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local NumberEntry = require("lexeme/numberentry")
local Progress = require("lexeme/progress")
local View = require("lexeme/view")

local GoTo = View:extend{
    ui = nil,
}

local PANEL_TOP = 596
local ENTRY_PITCH = 100

function GoTo:init()
    local w, h = Screen:getWidth(), Screen:getHeight()
    local top = h - D.s(1696 - PANEL_TOP)
    self.region = Geom:new{ x = 0, y = top, w = w, h = h - top }
    View.init(self)
    self.entries = self.ui.toc.toc or {}
    self.current = self:currentEntry()
    self.per_page = math.floor((self.region.h - D.s(955 - PANEL_TOP)) / D.s(ENTRY_PITCH))
    self.first = math.max(1, (self.current or 1) - math.floor(self.per_page / 2))
end

function GoTo:currentEntry()
    local page = Progress.page(self.ui)
    local current
    for i, entry in ipairs(self.entries) do
        if entry.page and entry.page <= page then current = i end
    end
    return current
end

function GoTo:render(bb, x, y, w, h)
    D.rect(bb, x, y, w, D.s(8))
    D.icon(bb, "handle", x + math.floor((w - D.s(130)) / 2), y + D.s(30), D.s(130), D.s(22))
    self:hit(x, y, w, D.s(80), function() self:close() end)

    local props = self.ui.doc_props or {}
    D.text(bb, x + D.s(36), y + D.s(735 - PANEL_TOP), D.face("bold", 40), props.display_title or "", D.BLACK,
        w - D.s(72))
    if props.authors then
        D.text(bb, x + D.s(36), y + D.s(790 - PANEL_TOP), D.face("regular", 34), props.authors, D.BLACK, w - D.s(72))
    end
    D.rect(bb, x, y + D.s(837 - PANEL_TOP), w, D.s(4))
    D.text(bb, x + D.s(36), y + D.s(905 - PANEL_TOP), D.face("regular", 34), "Go to page or location")
    D.icon(bb, "chevron-right", x + w - D.s(70), y + D.s(876 - PANEL_TOP), D.s(48), D.s(48))
    self:pressable(x, y + D.s(841 - PANEL_TOP), w, D.s(111), function() self:askPage() end,
        { x = x + D.s(5), y = y + D.s(846 - PANEL_TOP), w = w - D.s(11), h = D.s(101) })
    D.rect(bb, x, y + D.s(952 - PANEL_TOP), w, D.s(4))

    local list_top = y + D.s(956 - PANEL_TOP)
    local face, current_face = D.face("regular", 36), D.face("bold", 36)
    for row = 0, self.per_page - 1 do
        local i = self.first + row
        local entry = self.entries[i]
        if not entry then break end
        local baseline = list_top + D.s(70 + row * ENTRY_PITCH)
        local indent = D.s(156 + ((entry.depth or 1) - 1) * 40)
        local is_current = i == self.current
        if is_current then D.rect(bb, x + D.s(27), baseline - D.s(42), D.s(10), D.s(60)) end
        D.text(bb, x + indent, baseline, is_current and current_face or face, entry.title or "", D.BLACK,
            w - indent - D.s(60))
        self:hit(x, baseline - D.s(70), w, D.s(ENTRY_PITCH), function()
            self:close()
            Progress.goToPage(self.ui, entry.page)
        end)
    end
    if #self.entries == 0 then
        D.text(bb, x + D.s(156), list_top + D.s(70), face, "This book has no table of contents.")
    end
end

function GoTo:onSwipe(direction)
    if direction == "north" and self.first + self.per_page <= #self.entries then
        self.first = self.first + self.per_page
    elseif direction == "south" and self.first > 1 then
        self.first = math.max(1, self.first - self.per_page)
    else
        return true
    end
    self:refresh()
    return true
end

function GoTo:askPage()
    self:close()
    local ui = self.ui
    local count = Progress.pageCount(ui)
    UIManager:show(NumberEntry:new{
        title = "Go to page",
        intro = string.format("Enter a page number (from 1 to %d).", count),
        legend = "Page number",
        ok_text = "Go",
        max = count,
        on_ok = function(page) Progress.goToPage(ui, page) end,
    }, "ui")
end

function GoTo.show(ui)
    UIManager:show(GoTo:new{ ui = ui }, "ui")
end

return GoTo
