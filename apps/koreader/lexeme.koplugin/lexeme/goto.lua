-- The Go To panel: book title, "Go to page", and the table of contents.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Progress = require("lexeme/progress")
local View = require("lexeme/view")

local GoTo = View:extend{
    ui = nil,
}

-- "Go to page or location": a dialog with a number pad under it.
local GoToPage = View:extend{
    ui = nil,
    background = false,
}

local KEYPAD_TOP = 1193
local KEYPAD_COLS = { 392, 629, 865 }
local KEYPAD_ROWS = { 1270, 1387, 1502, 1617 }

function GoToPage:init()
    View.init(self)
    self.covers_fullscreen = false
    self.digits = ""
end

function GoToPage:type(key)
    if key == "back" then
        self.digits = self.digits:sub(1, -2)
    elseif key == "enter" then
        return self:go()
    elseif #self.digits < 6 then
        self.digits = self.digits .. key
    end
    self:refresh("fast")
end

function GoToPage:go()
    local page = tonumber(self.digits)
    if not page then return end
    self:close()
    Progress.goToPage(self.ui, page)
end

function GoToPage:render(bb, x, y, w, h)
    self:hit(x, y, w, h, function() self:close() end)
    local count = Progress.pageCount(self.ui)
    local bx, by, bw, bh = x + D.s(100), y + D.s(183), w - D.s(200), D.s(620)
    self:hit(bx, by, bw, bh, function() end)
    D.rect(bb, bx, by, bw, bh, D.WHITE)
    D.border(bb, bx, by, bw, bh, D.s(3), D.BLACK, D.s(12))
    D.text(bb, bx + D.s(58), by + D.s(100), D.face("bold", 30), "Go to page")
    local intro = string.format("Enter a page number (from 1 to %d).", count)
    D.text(bb, bx + D.s(58), by + D.s(167), D.face("regular", 32), intro, D.BLACK, bw - D.s(116))

    local fx, fy, fw, fh = bx + D.s(58), by + D.s(261), bw - D.s(116), D.s(99)
    D.border(bb, fx, fy, fw, fh, D.s(2))
    local legend_face = D.face("regular", 26)
    local legend = "Page number"
    local lw = D.width(legend_face, legend)
    D.rect(bb, fx + D.s(14), fy - D.s(4), lw + D.s(16), D.s(8), D.WHITE)
    D.text(bb, fx + D.s(22), fy + D.s(9), legend_face, legend)
    local tw = D.text(bb, fx + D.s(30), fy + D.s(64), D.face("regular", 34), self.digits)
    D.rect(bb, fx + D.s(32) + tw, fy + D.s(28), D.s(2), D.s(44))

    local button_y = by + bh - D.s(158)
    local cancel_x, go_x, button_w = bx + D.s(563), bx + D.s(799), D.s(213)
    D.border(bb, cancel_x, button_y, button_w, D.s(98), D.s(3), D.BLACK, D.s(8))
    D.textCenter(bb, cancel_x + button_w / 2, button_y + D.s(61), D.face("regular", 32), "Cancel")
    self:hit(cancel_x, button_y, button_w, D.s(98), function() self:close() end)
    local valid = tonumber(self.digits) and tonumber(self.digits) >= 1 and tonumber(self.digits) <= count
    D.roundRect(bb, go_x, button_y, button_w, D.s(98), valid and D.BLACK or D.gray(220), D.s(8))
    D.textCenter(bb, go_x + button_w / 2, button_y + D.s(61), D.face("regular", 32), "Go",
        valid and D.WHITE or D.gray(136))
    if valid then self:hit(go_x, button_y, button_w, D.s(98), function() self:go() end) end

    local top = y + h - D.s(1696 - KEYPAD_TOP)
    self:hit(x, top, w, h - (top - y), function() end)
    D.rect(bb, x, top, w, h - (top - y), D.WHITE)
    D.rect(bb, x, top, w, D.s(4))
    local keys = { { "1", "2", "3" }, { "4", "5", "6" }, { "7", "8", "9" }, { "back", "0", "enter" } }
    local face = D.face("regular", 44)
    for r, row in ipairs(keys) do
        local cy = top + D.s(KEYPAD_ROWS[r] - KEYPAD_TOP)
        for c, key in ipairs(row) do
            local cx = x + D.s(KEYPAD_COLS[c])
            if key == "back" then
                D.icon(bb, "delete", cx - D.s(33), cy - D.s(33), D.s(66), D.s(66))
            elseif key == "enter" then
                D.icon(bb, "corner-down-left", cx - D.s(36), cy - D.s(36), D.s(72), D.s(72))
            else
                D.textCenter(bb, cx, cy + D.s(16), face, key)
            end
            self:hit(cx - D.s(118), cy - D.s(57), D.s(236), D.s(114), function() self:type(key) end)
        end
    end
end

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
    self:hit(x, y + D.s(841 - PANEL_TOP), w, D.s(111), function() self:askPage() end)
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
    UIManager:show(GoToPage:new{ ui = self.ui }, "ui")
end

function GoTo.show(ui)
    UIManager:show(GoTo:new{ ui = ui }, "ui")
end

return GoTo
