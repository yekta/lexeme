-- The line under the page: reading progress on the left, percent on the right.
local BookList = require("ui/widget/booklist")
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")

local D = require("lexeme/draw")
local Locations = require("lexeme/locations")
local Progress = require("lexeme/progress")
local Status = require("lexeme/status")

local Footer = WidgetContainer:extend{}

-- Reading progress options, in the order the More tab and a tap on the progress cycle through them.
Footer.MODES = {
    { key = "location", label = "Location in book" },
    { key = "page", label = "Page in book" },
    { key = "chapter_time", label = "Time left in chapter" },
    { key = "book_time", label = "Time left in book" },
    { key = "none", label = "None" },
}

function Footer.mode()
    return G_reader_settings:readSetting("lexeme_progress_mode") or "location"
end

-- The strip the footer paints in, in screen pixels.
local function strip()
    local h = Screen:getHeight()
    return Geom:new{ x = 0, y = h - D.s(80), w = Screen:getWidth(), h = D.s(80) }
end

-- Moves to the next reading progress option, as tapping it does on a Kindle; Location is
-- skipped in books that have none.
function Footer.cycle(ui)
    local current = Footer.mode()
    local index = 1
    for i, m in ipairs(Footer.MODES) do
        if m.key == current then index = i end
    end
    for step = 1, #Footer.MODES do
        local mode = Footer.MODES[(index - 1 + step) % #Footer.MODES + 1].key
        if mode ~= "location" or Locations.current(ui) then
            G_reader_settings:saveSetting("lexeme_progress_mode", mode)
            break
        end
    end
    UIManager:setDirty(ui.dialog, "ui", strip())
    return true
end

-- A tap on the reading progress, at the bottom left, cycles it.
function Footer.registerTap(ui)
    local area = strip()
    local h = Screen:getHeight()
    ui:registerTouchZones({
        {
            id = "lexeme_footer_tap",
            ges = "tap",
            screen_zone = { ratio_x = 0, ratio_y = area.y / h, ratio_w = 0.45, ratio_h = area.h / h },
            handler = function() return Footer.cycle(ui) end,
            -- As KOReader's own footer tap: it wins over turning the page.
            overrides = {
                "readerconfigmenu_ext_tap", "readerconfigmenu_tap", "tap_forward", "tap_backward",
                "readermenu_tap", "readermenu_ext_tap", "readerhighlight_tap", "tap_top_left_corner",
                "tap_top_right_corner", "tap_left_bottom_corner", "tap_right_bottom_corner",
            },
        },
    })
end

local function leftText(ui)
    local mode = Footer.mode()
    if mode == "location" then
        -- "Loc 120", as the Kindle's reader puts it under the page; the toolbar gives the count.
        local location = Locations.current(ui)
        if location then return "Loc " .. location end
        mode = "page"
    end
    if mode == "page" then return "Page " .. Progress.pageLabel(ui) end
    if mode == "chapter_time" then return Progress.chapterTimeLeft(ui) .. " left in chapter" end
    if mode == "book_time" then return Progress.bookTimeLeft(ui) .. " left in book" end
end

-- KOReader saves a book's progress from its own footer, which we turn off; so
-- that it still saves, the progress is kept up to date on it from here.
function Footer:recordProgress()
    local footer = self.ui.view.footer
    local count = Progress.pageCount(self.ui)
    local percent = Progress.page(self.ui) / math.max(1, count)
    footer.pages = count
    if footer.percent_finished == percent then return end
    footer.percent_finished = percent
    BookList.setBookInfoCacheProperty(self.ui.document.file, "percent_finished", percent)
end

function Footer:paintTo(bb)
    if not self.ui.document then return end
    self:recordProgress()
    local w, h = Screen:getWidth(), Screen:getHeight()
    local face = D.face("bold", 29)
    local baseline = h - D.s(1696 - 1673)
    local text = leftText(self.ui)
    if text then D.text(bb, D.s(84), baseline, face, text) end
    D.textRight(bb, w - D.s(84), baseline, face, Progress.percent(self.ui) .. "%")
    if G_reader_settings:isTrue("lexeme_show_clock") then
        D.textCenter(bb, w / 2, D.s(48), D.face("regular", 26), Status.clock())
    end
end

return Footer
