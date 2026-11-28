-- The Go To panel: the book's title, "Go to page or location", and the table of contents, under
-- the toolbar's top bar, as the Kindle's reader shows it. Parts with chapters in them open and
-- close with their chevron; each entry has its location on the right.
--
-- Measured off Amazon's reader on a Paperwhite 5, at its own sizes (D.px).
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")

local Back = require("lexeme/backstack")
local D = require("lexeme/draw")
local NumberEntry = require("lexeme/numberentry")
local Progress = require("lexeme/progress")
local Toolbar = require("lexeme/toolbar")
local View = require("lexeme/view")

local GoTo = View:extend{
    ui = nil,
    actions = nil,
}

-- The toolbar's top bar, drawn and tapped as on the toolbar.
GoTo.paintTop = Toolbar.paintTop
GoTo.paintTimer = Toolbar.paintTimer
GoTo.openMore = Toolbar.openMore
GoTo.run = Toolbar.run

local PANEL_TOP = 347
local FIRST_BASELINE, ROW_PITCH = 775, 100.75
local ROWS = 9
local INDENT = 40

local KINDLE_ICONS = "/app/KPPMainApp/res/KPPUIComponents/internal/icons/"
local function chevron(name)
    local path = KINDLE_ICONS .. name .. ".svg"
    if lfs.attributes(path, "mode") == "file" then return path end
    return name
end

-- Each entry's children follow it, deeper; an entry opens to show them.
local function hasChildren(entries, i)
    local next_entry = entries[i + 1]
    return next_entry ~= nil and (next_entry.depth or 1) > (entries[i].depth or 1)
end

function GoTo:init()
    View.init(self)
    self.entries = self.ui.toc.toc or {}
    self.open = {}
    self.current = self:currentEntry()
    -- The parts holding the entry being read are open.
    if self.current then
        local depth = self.entries[self.current].depth or 1
        for i = self.current - 1, 1, -1 do
            local d = self.entries[i].depth or 1
            if d < depth then
                self.open[i] = true
                depth = d
            end
        end
    end
    local shown = self:shown()
    self.first = 1
    for row, i in ipairs(shown) do
        if i == self.current then
            self.first = math.max(1, math.min(row - 4, #shown - ROWS + 1))
        end
    end
end

function GoTo:currentEntry()
    local page = Progress.page(self.ui)
    local current
    for i, entry in ipairs(self.entries) do
        if entry.page and entry.page <= page then current = i end
    end
    return current
end

-- The entries shown: those whose parts are all open.
function GoTo:shown()
    local shown = {}
    local closed_below
    for i, entry in ipairs(self.entries) do
        local depth = entry.depth or 1
        if closed_below and depth > closed_below then
            -- inside a closed part
        else
            closed_below = nil
            table.insert(shown, i)
            if hasChildren(self.entries, i) and not self.open[i] then closed_below = depth end
        end
    end
    return shown
end

-- The entry's location (or page) as the Kindle lists it.
function GoTo:number(entry)
    local Locations = require("lexeme/locations")
    -- The location at the top of the entry's page, as the page itself shows it.
    if entry.page then
        local ok, xp = pcall(self.ui.document.getPageXPointer, self.ui.document, entry.page)
        local location = ok and xp and Locations.at(self.ui, xp)
        if location then return tostring(location) end
    end
    return entry.page and tostring(entry.page) or ""
end

-- The entry being read, among those shown: itself, or the closed part it's in.
function GoTo:currentShown(shown)
    if not self.current then return nil end
    local best
    for _, i in ipairs(shown) do
        if i <= self.current then best = i end
    end
    return best
end

function GoTo:render(bb, x, y, w, h)
    self:paintTop(bb, x, y, w)
    local top = y + D.px(PANEL_TOP)
    D.rect(bb, x, top, w, h - top, D.WHITE)
    D.rect(bb, x, top, w, D.px(9))
    local hw, hh = D.px(110), D.px(22)
    D.icon(bb, "panel-handle", x + math.floor((w - hw) / 2), y + D.px(388), hw, hh)
    self:hit(x, top, w, D.px(80), function() self:close() end)

    local props = self.ui.doc_props or {}
    D.text(bb, x + D.px(35), y + D.px(491), D.nface("bold", 42), props.display_title or "", D.BLACK, w - D.px(70))
    if props.authors then
        D.text(bb, x + D.px(34), y + D.px(548), D.nface("regular", 36), props.authors, D.BLACK, w - D.px(70))
    end
    D.rect(bb, x, y + D.px(588), w, D.px(4))
    D.text(bb, x + D.px(34), y + D.px(658), D.nface("regular", 36), "Go to page or location")
    local cs = D.px(43)
    D.icon(bb, chevron("chevron-right"), x + w - D.px(35) - math.floor(cs / 2), y + D.px(647) - math.floor(cs / 2), cs, cs)
    self:pressable(x, y + D.px(592), w, D.px(111), function() self:askPage() end,
        { x = x + D.px(5), y = y + D.px(597), w = w - D.px(11), h = D.px(101) })
    D.rect(bb, x, y + D.px(703), w, D.px(4))

    local shown = self:shown()
    local current = self:currentShown(shown)
    local face, current_face = D.nface("regular", 36), D.nface("bold", 36)
    local right = x + w - D.px(146)
    for row = 0, ROWS - 1 do
        local i = shown[self.first + row]
        if not i then break end
        local entry = self.entries[i]
        local baseline = y + D.px(FIRST_BASELINE + math.floor(row * ROW_PITCH + 0.5))
        local cy = baseline - D.px(11)
        local depth = (entry.depth or 1) - 1
        local is_current = i == current
        local number = self:number(entry)
        local number_face = is_current and current_face or face
        local number_w = D.width(number_face, number)
        local tx = x + D.px(156 + depth * INDENT)
        if is_current then D.rect(bb, x + D.px(27), cy - D.px(50), D.px(14), D.px(101)) end
        D.text(bb, tx, baseline, is_current and current_face or face, entry.title or "", D.BLACK,
            right - number_w - D.px(30) - tx)
        D.textRight(bb, right, baseline, number_face, number)
        self:hit(x, cy - D.px(50), w - D.px(100), D.px(101), function()
            self:close()
            GoTo.jump(self.ui, function() Progress.goToPage(self.ui, entry.page) end)
        end)
        if hasChildren(self.entries, i) then
            local cx = x + D.px(113 + depth * INDENT)
            local name = self.open[i] and "chevron-down" or "chevron-right"
            D.icon(bb, chevron(name), cx - math.floor(cs / 2), cy - math.floor(cs / 2), cs, cs)
            self:hit(cx - D.px(50), cy - D.px(50), D.px(100), D.px(101), function()
                self.open[i] = not self.open[i] or nil
                self:refresh()
            end)
        end
    end
    if #self.entries == 0 then
        D.text(bb, x + D.px(156), y + D.px(FIRST_BASELINE), face, "This book has no table of contents.")
    end
    self:paintScroll(bb, x, y, w, #shown)
end

-- The scroll bar on the right: an arrow at each end, a dotted track between them with the part shown
-- in black.
function GoTo:paintScroll(bb, x, y, w, total)
    if total <= ROWS then return end
    local cx = x + w - D.px(64)
    local up, down = self.first > 1, self.first + ROWS <= total
    local tw, th = D.px(35), D.px(21)
    local up_y, down_y = y + D.px(754), y + D.px(1557)
    D.icon(bb, up and "triangle-up" or "triangle-up-gray", cx - math.floor(tw / 2), up_y, tw, th)
    D.icon(bb, down and "triangle-down" or "triangle-down-gray", cx - math.floor(tw / 2), down_y, tw, th)
    self:pressable(cx - D.px(50), up_y - D.px(40), D.px(100), D.px(100), function() self:onSwipe("south") end,
        D.around(cx, up_y + D.px(10), D.px(101), D.px(101)))
    self:pressable(cx - D.px(50), down_y - D.px(40), D.px(100), D.px(100), function() self:onSwipe("north") end,
        D.around(cx, down_y + D.px(10), D.px(101), D.px(101)))
    local track_top, track_bottom = up_y + D.px(46), down_y - D.px(40)
    for dot = track_top, track_bottom, D.px(5) do D.rect(bb, cx, dot, 1, 1, D.gray(80)) end
    local span = track_bottom - track_top
    local t0 = track_top + math.floor(span * (self.first - 1) / total)
    local t1 = track_top + math.floor(span * math.min(total, self.first + ROWS - 1) / total)
    D.rect(bb, cx - D.px(5), t0, D.px(10), math.max(D.px(10), t1 - t0))
end

function GoTo:onSwipe(direction)
    local total = #self:shown()
    if direction == "north" and self.first + ROWS <= total then
        self.first = self.first + ROWS
    elseif direction == "south" and self.first > 1 then
        self.first = math.max(1, self.first - ROWS)
    else
        return true
    end
    self:refresh()
    return true
end

function GoTo:askPage()
    self:close()
    local ui = self.ui
    local Locations = require("lexeme/locations")
    local _, locations = Locations.current(ui)
    if locations then
        UIManager:show(NumberEntry:new{
            title = "Go to location",
            intro = string.format("Enter a location (from 1 to %d).", locations),
            legend = "Location",
            ok_text = "Go",
            max = locations,
            on_ok = function(location) GoTo.jump(ui, function() Locations.goTo(ui, location) end) end,
        }, "ui")
        return
    end
    local count = Progress.pageCount(ui)
    UIManager:show(NumberEntry:new{
        title = "Go to page",
        intro = string.format("Enter a page number (from 1 to %d).", count),
        legend = "Page number",
        ok_text = "Go",
        max = count,
        on_ok = function(page) GoTo.jump(ui, function() Progress.goToPage(ui, page) end) end,
    }, "ui")
end

-- As on the Kindle, a jump from Go To keeps where it left for "Back to", and the toolbar comes back
-- over the new page with that button on it.
function GoTo.jump(ui, go)
    Back.jump(ui, go)
    Toolbar.show(ui)
end

function GoTo.show(ui)
    local actions = Toolbar.actions_for and Toolbar.actions_for[ui]
    UIManager:show(GoTo:new{ ui = ui, actions = actions }, "ui")
end

return GoTo
