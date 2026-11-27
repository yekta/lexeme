-- The Aa panel: Themes, Font, Layout and More, over the bottom of the page.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local C = require("lexeme/controls")
local Button = require("lexeme/button")
local D = require("lexeme/draw")
local Footer = require("lexeme/footer")
local Layout = require("lexeme/layout")
local View = require("lexeme/view")

local Aa = View:extend{
    ui = nil,
    tab = "font",
    page = nil, -- "font_family" or "spacing" when a sub-page is open
}

local PANEL_TOP = 678
local TABS = {
    { key = "themes", label = "Themes" },
    { key = "font", label = "Font" },
    { key = "layout", label = "Layout" },
    { key = "more", label = "More" },
}

function Aa:init()
    local w, h = Screen:getWidth(), Screen:getHeight()
    local top = h - D.s(1696 - PANEL_TOP)
    self.region = Geom:new{ x = 0, y = top, w = w, h = h - top }
    View.init(self)
    self.tab = G_reader_settings:readSetting("lexeme_aa_tab") or "font"
end

function Aa:changed()
    -- The page under the panel reflows; repaint it and the panel.
    UIManager:setDirty(self.ui.dialog, "partial")
    self:refresh()
end

function Aa:render(bb, x, y, w, h)
    D.rect(bb, x, y, w, D.s(4))
    if self.page then
        self:paintSubpageHeader(bb, x, y, w)
    else
        self:paintTabs(bb, x, y, w)
    end
    D.rect(bb, x, y + D.s(786 - PANEL_TOP), w, D.s(4))
    local top = y + D.s(790 - PANEL_TOP)
    if self.page == "font_family" then
        self:paintFontFamily(bb, x, top, w)
    elseif self.page == "spacing" then
        self:paintSpacing(bb, x, top, w)
    elseif self.page == "manage_themes" then
        self:paintManageThemes(bb, x, top, w)
    elseif self.page == "reading_progress" then
        self:paintReadingProgress(bb, x, top)
    elseif self.tab == "themes" then
        self:paintThemes(bb, x, top, w, y + h)
    elseif self.tab == "font" then
        self:paintFont(bb, x, top, w)
    elseif self.tab == "layout" then
        self:paintLayout(bb, x, top, w)
    else
        self:paintMore(bb, x, top, w)
    end
end

function Aa:paintTabs(bb, x, y, w)
    local tx = x + D.s(44)
    local baseline = y + D.s(753 - PANEL_TOP)
    for _, tab in ipairs(TABS) do
        local active = self.tab == tab.key
        local face = D.face(active and "bold" or "regular", 32)
        local tw = D.text(bb, tx, baseline, face, tab.label)
        if active then
            D.rect(bb, tx - D.s(13), y + D.s(778 - PANEL_TOP), tw + D.s(26), D.s(7))
        end
        self:pressable(tx - D.s(24), y, tw + D.s(48), D.s(108), function()
            self.tab = tab.key
            G_reader_settings:saveSetting("lexeme_aa_tab", tab.key)
            self:refresh()
        end, { x = tx - D.s(15), y = y + D.s(700 - PANEL_TOP), w = tw + D.s(30), h = D.s(85) })
        tx = tx + tw + D.s(49)
    end
end

function Aa:paintSubpageHeader(bb, x, y, w)
    local titles = {
        font_family = "Font family",
        spacing = "Spacing",
        manage_themes = "Manage themes",
        reading_progress = "Reading progress",
    }
    local title = titles[self.page]
    D.icon(bb, "arrow-left", x + D.s(44), y + D.s(713 - PANEL_TOP), D.s(44), D.s(44))
    D.text(bb, x + D.s(108), y + D.s(745 - PANEL_TOP), D.face("bold", 32), title)
    self:hit(x, y, D.s(500), D.s(108), function()
        self.page = nil
        self:refresh()
    end)
end

local function chevron(bb, right, cy)
    D.icon(bb, "chevron-right", right - D.s(34), cy - D.s(20), D.s(40), D.s(40))
end

-- Themes ------------------------------------------------------------------------

local THEME_LINES = { compact = { 7, 8 }, standard = { 6, 10 }, large = { 4, 14 } }

-- The small page drawing next to a theme's name.
local function themeIcon(bb, x, cy, theme, selected)
    local w, h = D.s(64), D.s(80)
    local top = cy - math.floor(h / 2)
    D.border(bb, x, top, w, h, D.s(3), D.BLACK, D.s(8))
    if theme == nil then
        D.textCenter(bb, x + w / 2, cy + D.s(16), D.face("regular", 40), "A")
    elseif theme.saved then
        D.icon(bb, "user", x + D.s(12), cy - D.s(20), D.s(40), D.s(40))
    elseif theme.key == "low_vision" then
        D.icon(bb, "eye", x + D.s(12), cy - D.s(20), D.s(40), D.s(40))
    else
        local lines, gap = THEME_LINES[theme.key][1], THEME_LINES[theme.key][2]
        local line_y = top + D.s(14)
        for _ = 1, lines do
            D.rect(bb, x + D.s(12), line_y, w - D.s(24), D.s(lines > 5 and 2 or 3))
            line_y = line_y + D.s(gap)
        end
    end
    if selected then D.icon(bb, "check", x - D.s(18), top - D.s(22), D.s(40), D.s(40)) end
end

local function themeLabel(bb, x, cy, label, selected)
    local face = D.face("bold", 32)
    if selected then
        D.text(bb, x, cy - D.s(2), face, label)
        D.text(bb, x, cy + D.s(36), D.face("italic", 28), "Current theme")
    else
        D.text(bb, x, cy + D.s(12), face, label)
    end
end

function Aa:paintThemes(bb, x, top, w, bottom)
    local current = Layout.currentTheme()
    local items = {}
    if not current then table.insert(items, { custom = true }) end
    for _, theme in ipairs(Layout.allThemes()) do
        if not Layout.isHidden(theme) then table.insert(items, { theme = theme }) end
    end
    for i, item in ipairs(items) do
        local col, row = (i - 1) % 2, math.floor((i - 1) / 2)
        local ix = x + D.s(col == 0 and 82 or 652)
        local cy = top + D.s(105 + row * 162)
        local selected = item.custom or (current and current.key == item.theme.key)
        themeIcon(bb, ix, cy, item.theme, selected)
        themeLabel(bb, ix + D.s(98), cy, item.custom and "Custom" or item.theme.label, selected)
        if item.theme then
            self:hit(ix - D.s(20), cy - D.s(70), D.s(540), D.s(140), function()
                Layout.applyTheme(self.ui, item.theme)
                self:changed()
            end)
        end
    end

    local button_top = bottom - D.s(1696 - 1453)
    local save = { label = "Save current settings", size = 30, baseline = 58, w = w - D.s(132), h = 94, border = 2 }
    Button.paint(self, bb, x + D.s(66), button_top, save, current == nil and function() self:askThemeName() end or nil)
    local manage_top = bottom - D.s(1696 - 1580)
    D.rect(bb, x, manage_top, w, D.s(4))
    D.text(bb, x + D.s(66), manage_top + D.s(70), D.face("regular", 32), "Manage themes")
    chevron(bb, x + w - D.s(67), manage_top + D.s(58))
    self:hit(x, manage_top + D.s(4), w, bottom - manage_top, function()
        self.page = "manage_themes"
        self:refresh()
    end)
end

function Aa:askThemeName(index)
    require("lexeme/textentry").show{
        title = index and "Rename theme" or "Name this theme",
        on_done = function(name)
            name = name:gsub("^%s+", ""):gsub("%s+$", "")
            if name == "" then return end
            if index then Layout.renameTheme(index, name) else Layout.saveTheme(name) end
            self:refresh()
        end,
    }
end

function Aa:paintManageThemes(bb, x, top, w)
    local current = Layout.currentTheme()
    local rows = {}
    if not current then table.insert(rows, { custom = true }) end
    for _, theme in ipairs(Layout.allThemes()) do table.insert(rows, { theme = theme }) end
    for i, row in ipairs(rows) do
        local cy = top + D.s(80 + (i - 1) * 120)
        local selected = row.custom or (current and current.key == row.theme.key)
        themeIcon(bb, x + D.s(66), cy, row.theme, selected)
        themeLabel(bb, x + D.s(164), cy, row.custom and "Custom" or row.theme.label, selected)
        local theme = row.theme
        if theme then
            local visible = not Layout.isHidden(theme)
            C.toggle(bb, x + w - D.s(60), cy, visible)
            self:hit(x + w - D.s(170), cy - D.s(55), D.s(170), D.s(110), function()
                Layout.setHidden(theme, visible)
                self:refresh()
            end)
            if theme.saved then
                D.icon(bb, "trash-2", x + w - D.s(250), cy - D.s(24), D.s(48), D.s(48))
                self:pressable(x + w - D.s(280), cy - D.s(55), D.s(100), D.s(110), function()
                    require("lexeme/dialog"):new{
                        title = "Delete theme?",
                        message = "“" .. theme.label .. "” will be removed.",
                        ok_text = "Delete",
                        on_ok = function()
                            Layout.deleteTheme(theme.saved)
                            self:refresh()
                        end,
                    }:show()
                end, D.around(x + w - D.s(226), cy, D.s(109), D.s(110)))
                D.icon(bb, "pencil", x + w - D.s(350), cy - D.s(24), D.s(48), D.s(48))
                self:pressable(x + w - D.s(380), cy - D.s(55), D.s(100), D.s(110), function()
                    self:askThemeName(theme.saved)
                end, D.around(x + w - D.s(326), cy, D.s(109), D.s(110)))
            end
        end
    end
end

-- Font --------------------------------------------------------------------------

function Aa:paintFont(bb, x, top, w)
    local label = D.face("bold", 32)
    local row_y = top + D.s(902 - 790)
    D.text(bb, x + D.s(65), row_y, label, "Font family")
    local font = Layout.currentFont(self.ui)
    D.textRight(bb, x + w - D.s(1272 - 1143), row_y, D.face(font.file or "regular", 32), font.label)
    chevron(bb, x + w - D.s(1272 - 1205), row_y - D.s(12))
    self:hit(x, row_y - D.s(70), w, D.s(110), function()
        self.page = "font_family"
        self:refresh()
    end)

    local function sliderRow(name, cy, value, min, max, on_change, step)
        D.text(bb, x + D.s(61), cy + D.s(11), label, name)
        C.slider(self, bb, {
            x0 = x + D.s(567), x1 = x + D.s(1072), cy = cy, min = min, max = max, value = value, step = step,
            knob = D.s(69), thick = D.s(10), thin = D.s(4), label = true, buttons = true, extend = true,
            on_change = on_change,
        })
    end
    sliderRow("Bold", top + D.s(1066 - 790), Layout.get("lexeme_bold"), 0, #Layout.WEIGHTS, function(v)
        Layout.setBold(self.ui, v)
        self:changed()
    end)
    sliderRow("Size", top + D.s(1293 - 790), Layout.get("lexeme_size"), 1, #Layout.SIZES, function(v)
        Layout.setSize(self.ui, v)
        self:changed()
    end, Layout.SIZE_STEP)

    local spacing_y = top + D.s(1500 - 790)
    D.text(bb, x + D.s(63), spacing_y, label, "Spacing")
    D.text(bb, x + D.s(63), spacing_y + D.s(38), D.face("regular", 26),
        "Adjust spacing between lines, paragraphs, words and characters.")
    chevron(bb, x + w - D.s(1272 - 1205), spacing_y + D.s(12))
    self:hit(x, spacing_y - D.s(50), w, D.s(120), function()
        self.page = "spacing"
        self:refresh()
    end)
end

-- Like the Kindle's, the tapped font's radio fills at once; the page reflows after.
function Aa:paintFontFamily(bb, x, top, w)
    local current = self.ui.font.font_face
    local fonts = Layout.availableFonts()
    local function position(i)
        local col, row = (i - 1) % 2, math.floor((i - 1) / 2)
        return x + D.s(col == 0 and 70 or 667), top + D.s(59 + row * 110)
    end
    local function paintRadios(target, selected)
        local size = D.s(40)
        for i, font in ipairs(fonts) do
            local fx, cy = position(i)
            D.rect(target, fx, cy - math.floor(size / 2), size, size, D.WHITE)
            C.radio(target, fx, cy, font.name == selected)
        end
    end
    paintRadios(bb, current)
    local list_h = D.s(math.ceil(#fonts / 2) * 110)
    for i, font in ipairs(fonts) do
        local fx, cy = position(i)
        D.text(bb, fx + D.s(63), cy + D.s(11), D.face(font.file or "regular", 32), font.label)
        self:pressable(fx - D.s(20), cy - D.s(55), D.s(570), D.s(110), function()
            if font.name == current then return end
            Layout.setFont(self.ui, font.name)
            self:changed()
        end, { x = x, y = top, w = w, h = list_h, paint = function(target)
            if font.name ~= current then paintRadios(target, font.name) end
        end })
    end
end

-- The spacing list scrolls by one step, like the Kindle's: the arrows jump to either end.
local SPACING_SCROLL = 410
local SPACING_ROW = 306

local function triangle(bb, cx, y, h, up, color)
    for row = 0, h - 1 do
        local half = math.floor((up and row or h - 1 - row) + 1)
        D.rect(bb, cx - half, y + row, 2 * half, 1, color)
    end
end

function Aa:paintSpacing(bb, x, top, w)
    local bottom = top + D.s(1696 - 790)
    local scroll = D.s(self.spacing_scroll or 0)
    local rows = {
        { label = "Line spacing", key = "lexeme_line_spacing", set = Layout.setLineSpacing },
        { label = "Paragraph spacing", key = "lexeme_paragraph_spacing", set = Layout.setParagraphSpacing },
        { label = "Word spacing", key = "lexeme_word_spacing", set = Layout.setWordSpacing },
        { label = "Character spacing", key = "lexeme_character_spacing", set = Layout.setCharacterSpacing },
    }
    local function visible(y0, y1) return y0 >= top and y1 <= bottom end
    for i, row in ipairs(rows) do
        local offset = D.s((i - 1) * SPACING_ROW) - scroll
        local baseline = top + D.s(73) + offset
        if visible(baseline - D.s(31), baseline) then
            D.text(bb, x + D.s(74), baseline, D.face("regular", 32), row.label)
        end
        local cy = top + D.s(186) + offset
        if visible(cy - D.s(70), cy + D.s(35)) then
            C.slider(self, bb, {
                x0 = x + D.s(237), x1 = x + D.s(919), cy = cy, min = 0, max = Layout.SPACING_LEVELS,
                value = Layout.get(row.key), knob = D.s(69), thick = D.s(10), thin = D.s(4),
                label = true, buttons = true, extend = true,
                on_change = function(v)
                    row.set(self.ui, v)
                    self:changed()
                end,
            })
        end
    end
    local reset_baseline = top + D.s(1276) - scroll
    if visible(reset_baseline - D.s(30), reset_baseline + D.s(9)) then
        local gray = D.gray(119)
        local face = D.face("regular", 32)
        local label = "Reset to default"
        local label_w = D.width(face, label)
        local lx = x + D.s(580) - math.floor(label_w / 2)
        D.text(bb, lx, reset_baseline, face, label, gray)
        D.rect(bb, lx, reset_baseline + D.s(6), label_w, D.s(3), gray)
        self:pressable(lx - D.s(20), reset_baseline - D.s(45), label_w + D.s(40), D.s(70), function()
            Layout.resetSpacing(self.ui)
            self:changed()
        end, { x = lx, y = reset_baseline - D.s(32), w = label_w, h = D.s(42) })
    end

    -- Scrollbar: a gray track with the visible part in black, between two arrows.
    local track_x, track_y, track_h = x + D.s(1205), top + D.s(100), D.s(675)
    local thumb_h = D.s(469)
    local thumb_y = track_y + math.floor((track_h - thumb_h) * scroll / D.s(SPACING_SCROLL) + 0.5)
    D.roundRect(bb, track_x, track_y, D.s(9), track_h, D.gray(119), D.s(4))
    D.roundRect(bb, track_x, thumb_y, D.s(9), thumb_h, D.BLACK, D.s(4))
    local at_top, at_bottom = scroll == 0, scroll >= D.s(SPACING_SCROLL)
    triangle(bb, x + D.s(1210), top + D.s(42), D.s(14), true, at_top and D.gray(119) or D.BLACK)
    triangle(bb, x + D.s(1210), top + D.s(817), D.s(14), false, at_bottom and D.gray(119) or D.BLACK)
    self:pressable(x + D.s(1170), top + D.s(10), D.s(90), D.s(80), function()
        self.spacing_scroll = 0
        self:refresh()
    end, D.around(x + D.s(1210), top + D.s(49), D.s(101), D.s(101)))
    self:pressable(x + D.s(1170), top + D.s(785), D.s(90), D.s(80), function()
        self.spacing_scroll = SPACING_SCROLL
        self:refresh()
    end, D.around(x + D.s(1210), top + D.s(824), D.s(101), D.s(100)))
end

-- Layout ------------------------------------------------------------------------

local function optionBox(bb, x, y, w, h, selected)
    D.border(bb, x, y, w, h, D.s(selected and 5 or 2), D.BLACK, D.s(10))
end

local function textLines(bb, x, y, w, h, inset, widths)
    local line_y = y + D.s(18)
    local step = math.floor((h - D.s(36)) / (#widths - 1))
    for _, fraction in ipairs(widths) do
        local lw = math.floor((w - 2 * inset) * fraction)
        D.rect(bb, x + inset, line_y, lw, D.s(2))
        line_y = line_y + step
    end
end

function Aa:paintLayout(bb, x, top, w)
    local label = D.face("regular", 30)
    D.text(bb, x + D.s(80), top + D.s(867 - 790), label, "Orientation")
    local landscape = Layout.isLandscape()
    local oy = top + D.s(908 - 790)
    optionBox(bb, x + D.s(80), oy, D.s(88), D.s(118), not landscape)
    textLines(bb, x + D.s(80), oy, D.s(88), D.s(118), D.s(16), { 1, 1, 1, 1, 1, 1, 1 })
    optionBox(bb, x + D.s(197), oy, D.s(119), D.s(78), landscape)
    textLines(bb, x + D.s(197), oy, D.s(119), D.s(78), D.s(16), { 1, 1, 1, 1, 1 })
    self:hit(x + D.s(70), oy - D.s(10), D.s(110), D.s(140), function()
        Layout.setLandscape(self.ui, false)
    end)
    self:hit(x + D.s(187), oy - D.s(10), D.s(140), D.s(140), function()
        Layout.setLandscape(self.ui, true)
    end)

    D.text(bb, x + D.s(547), top + D.s(880 - 790), label, "Margins")
    local margins = Layout.get("lexeme_margins")
    local insets = { 12, 26, 40 }
    for i = 1, 3 do
        local mx = x + D.s(547 + (i - 1) * 169)
        local my = top + D.s(931 - 790)
        optionBox(bb, mx, my, D.s(140), D.s(80), margins == i)
        textLines(bb, mx, my, D.s(140), D.s(80), D.s(insets[i]), { 1, 1, 1, 1, 1 })
        self:hit(mx - D.s(10), my - D.s(20), D.s(160), D.s(120), function()
            Layout.setMargins(self.ui, i)
            self:changed()
        end)
    end

    D.text(bb, x + D.s(80), top + D.s(1103 - 790), label, "Alignment")
    local align = Layout.get("lexeme_align")
    local ay = top + D.s(1144 - 790)
    optionBox(bb, x + D.s(80), ay, D.s(140), D.s(78), align == "justify")
    textLines(bb, x + D.s(80), ay, D.s(140), D.s(78), D.s(16), { 1, 1, 1, 1 })
    optionBox(bb, x + D.s(249), ay, D.s(140), D.s(78), align == "left")
    textLines(bb, x + D.s(249), ay, D.s(140), D.s(78), D.s(16), { 1, 0.8, 0.95, 0.7 })
    self:hit(x + D.s(70), ay - D.s(20), D.s(160), D.s(118), function()
        Layout.setAlign(self.ui, "justify")
        self:changed()
    end)
    self:hit(x + D.s(239), ay - D.s(20), D.s(160), D.s(118), function()
        Layout.setAlign(self.ui, "left")
        self:changed()
    end)
end

-- More ------------------------------------------------------------------------------

local function modeLabel()
    local mode = Footer.mode()
    for _, m in ipairs(Footer.MODES) do
        if m.key == mode then return m.label end
    end
end

function Aa:paintMore(bb, x, top, w)
    local rows = {
        {
            title = "Reading progress",
            value = modeLabel(),
            page = "reading_progress",
        },
        {
            title = "Show clock while reading",
            toggle = G_reader_settings:isTrue("lexeme_show_clock"),
            tap = function() G_reader_settings:flipNilOrFalse("lexeme_show_clock") end,
        },
        {
            title = "Full page refresh",
            subtitle = "Refresh the whole screen on every page turn to clear ghosting.",
            toggle = G_reader_settings:readSetting("full_refresh_count") == 1,
            tap = function()
                local every_page = G_reader_settings:readSetting("full_refresh_count") == 1
                local count = every_page and 6 or 1
                G_reader_settings:saveSetting("full_refresh_count", count)
                UIManager:setRefreshRate(count, count * 2)
            end,
        },
    }
    local row_top = top
    for _, row in ipairs(rows) do
        local h = row.subtitle and D.s(146) or D.s(124)
        local baseline = row_top + (row.subtitle and D.s(60) or D.s(72))
        D.text(bb, x + D.s(36), baseline, D.face("bold", 28), row.title)
        if row.subtitle then
            D.text(bb, x + D.s(36), baseline + D.s(36), D.face("italic", 24), row.subtitle, D.BLACK, w - D.s(230))
        end
        if row.value then
            D.textRight(bb, x + w - D.s(120), baseline, D.face("regular", 28), row.value)
            chevron(bb, x + w - D.s(80), baseline - D.s(10))
        else
            C.toggle(bb, x + w - D.s(80), row_top + math.floor(h / 2), row.toggle)
        end
        self:hit(x, row_top, w, h, function()
            if row.page then
                self.page = row.page
            else
                row.tap()
                UIManager:setDirty(self.ui.dialog, "ui")
            end
            self:refresh()
        end)
        row_top = row_top + h
        D.rect(bb, x + D.s(36), row_top - D.s(2), w - D.s(150), D.s(2))
    end
end

function Aa:paintReadingProgress(bb, x, top)
    local mode = Footer.mode()
    for i, m in ipairs(Footer.MODES) do
        local col, row = (i - 1) % 2, math.floor((i - 1) / 2)
        local rx, cy = x + D.s(col == 0 and 89 or 661), top + D.s(110 + row * 117)
        local size = D.s(37)
        D.icon(bb, m.key == mode and "radio-on-small" or "radio", rx, cy - math.floor(size / 2), size, size)
        D.text(bb, rx + D.s(76), cy + D.s(12), D.face("regular", 32), m.label)
        self:hit(rx - D.s(20), cy - D.s(55), D.s(550), D.s(110), function()
            if m.key == mode then return end
            G_reader_settings:saveSetting("lexeme_progress_mode", m.key)
            UIManager:setDirty(self.ui.dialog, "ui")
            self:refresh()
        end)
    end
end

function Aa.show(ui)
    UIManager:show(Aa:new{ ui = ui }, "ui")
end

return Aa
