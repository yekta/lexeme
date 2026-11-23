-- The line under the page: reading progress on the left, percent on the right.
local BookList = require("ui/widget/booklist")
local Screen = require("device").screen
local WidgetContainer = require("ui/widget/container/widgetcontainer")

local D = require("lexeme/draw")
local Progress = require("lexeme/progress")
local Status = require("lexeme/status")

local Footer = WidgetContainer:extend{}

-- Reading progress options, in the order the More tab cycles through them.
Footer.MODES = {
    { key = "page", label = "Page in book" },
    { key = "chapter_time", label = "Time left in chapter" },
    { key = "book_time", label = "Time left in book" },
    { key = "none", label = "None" },
}

function Footer.mode()
    return G_reader_settings:readSetting("lexeme_progress_mode") or "page"
end

local function leftText(ui)
    local mode = Footer.mode()
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
