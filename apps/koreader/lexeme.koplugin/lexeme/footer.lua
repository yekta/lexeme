-- The line under the page: reading progress on the left, percent on the right.
local BookList = require("ui/widget/booklist")
local Screen = require("device").screen
local WidgetContainer = require("ui/widget/container/widgetcontainer")

local D = require("lexeme/draw")
local Locations = require("lexeme/locations")
local Progress = require("lexeme/progress")
local Status = require("lexeme/status")

local Footer = WidgetContainer:extend{}

-- Reading progress options, in the order a tap on the progress cycles through them.
Footer.MODES = {
    { key = "page", label = "Page in book" },
    { key = "chapter_time", label = "Time left in chapter" },
    { key = "book_time", label = "Time left in book" },
    { key = "location", label = "Location in book" },
    { key = "none", label = "None" },
}

-- As the Kindle draws it: bold 29 px, 80 px in from the edges, on a baseline 22 px up.
local function face()
    return D.nface("bold", 29)
end

function Footer.mode()
    return G_reader_settings:readSetting("lexeme_progress_mode") or "page"
end

function Footer.nextMode()
    local mode = Footer.mode()
    for i, m in ipairs(Footer.MODES) do
        if m.key == mode then return Footer.MODES[i % #Footer.MODES + 1].key end
    end
    return Footer.MODES[1].key
end

local function leftText(ui)
    local mode = Footer.mode()
    if mode == "page" then
        local label = Progress.pageLabel(ui)
        return "Page " .. (tonumber(label) and Locations.format(tonumber(label)) or label)
    end
    if mode == "chapter_time" then return Progress.chapterTimeLeft(ui) .. " left in chapter" end
    if mode == "book_time" then return Progress.bookTimeLeft(ui) .. " left in book" end
    if mode == "location" then
        local location = Locations.current(ui)
        if location then return "Loc " .. Locations.format(location) end
        return "Page " .. Progress.pageLabel(ui)
    end
end

-- The band the progress line sits in, from its top edge to the bottom of the screen.
function Footer.top()
    return Screen:getHeight() - D.s(61)
end

-- Taps in the band left of this cycle the progress: up to the end of its text, as on a Kindle,
-- and no less than a short label's width so there is something to tap when it shows nothing.
function Footer.progressRight(ui)
    local text = leftText(ui)
    local right = D.px(80) + (text and D.width(face(), text) or 0)
    return math.max(right, D.s(250))
end

-- KOReader saves a book's progress from its own footer, which we turn off; so
-- that it still saves, the progress is kept up to date on it from here.
function Footer:recordProgress()
    local footer = self.ui.view.footer
    local count = Progress.pageCount(self.ui)
    local percent = Progress.fraction(self.ui)
    footer.pages = count
    if footer.percent_finished == percent then return end
    footer.percent_finished = percent
    BookList.setBookInfoCacheProperty(self.ui.document.file, "percent_finished", percent)
end

function Footer:paintTo(bb)
    if not self.ui.document then return end
    self:recordProgress()
    local w, h = Screen:getWidth(), Screen:getHeight()
    -- After a link, the bar to go back takes the line's place (lexeme/notes.lua).
    local Notes = require("lexeme/notes")
    if Notes.barActive(self.ui) then return Notes.paintBar(bb, self.ui) end
    if G_reader_settings:isTrue("lexeme_show_clock") then
        D.textCenter(bb, w / 2, D.px(42), face(), Status.clock())
    end
    local text = leftText(self.ui)
    if not text then return end
    local baseline = h - D.px(22)
    D.text(bb, D.px(80), baseline, face(), text)
    D.textRight(bb, w - D.px(81), baseline, face(), Progress.percent(self.ui) .. "%")
end

return Footer
