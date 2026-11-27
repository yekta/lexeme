-- Where the reader is in the book, as the footer and toolbar describe it.
local Progress = {}

function Progress.page(ui)
    if ui.document.info.has_pages then return ui.paging.current_page end
    return ui.document:getCurrentPage()
end

function Progress.pageCount(ui)
    return ui.document:getPageCount()
end

-- The page as the Kindle numbers it: the print edition's page when the book
-- carries a page map, the screen page otherwise.
function Progress.pageLabel(ui)
    local pagemap = ui.pagemap
    if pagemap and pagemap.has_pagemap then
        local label = pagemap:getCurrentPageLabel(true)
        if label and label ~= "" then return label end
    end
    return tostring(Progress.page(ui))
end

function Progress.pageCountLabel(ui)
    local pagemap = ui.pagemap
    if pagemap and pagemap.has_pagemap then
        local label = pagemap:getLastPageLabel(true)
        if label and label ~= "" then return label end
    end
    return tostring(Progress.pageCount(ui))
end

function Progress.percent(ui)
    return math.floor(Progress.page(ui) / math.max(1, Progress.pageCount(ui)) * 100 + 0.5)
end

function Progress.chapter(ui)
    return ui.toc:getTocTitleByPage(Progress.page(ui)) or ""
end

local function pageSeconds(ui)
    local stats = ui.statistics
    if stats and stats.avg_time and stats.avg_time > 0 then return stats.avg_time end
    return 60
end

-- "1 hr 57 mins", "12 mins", "1 min"
function Progress.duration(seconds)
    local minutes = math.max(1, math.floor(seconds / 60 + 0.5))
    local hours = math.floor(minutes / 60)
    minutes = minutes % 60
    local parts = {}
    if hours > 0 then table.insert(parts, hours .. (hours == 1 and " hr" or " hrs")) end
    if minutes > 0 then table.insert(parts, minutes .. (minutes == 1 and " min" or " mins")) end
    return table.concat(parts, " ")
end

function Progress.chapterTimeLeft(ui)
    local page = Progress.page(ui)
    -- In screen pages: with a page map (Kindle locations, print pages) KOReader counts its entries.
    local left = ui.toc:getChapterPagesLeft(page, true) or (Progress.pageCount(ui) - page)
    return Progress.duration(left * pageSeconds(ui))
end

function Progress.bookTimeLeft(ui)
    return Progress.duration((Progress.pageCount(ui) - Progress.page(ui)) * pageSeconds(ui))
end

function Progress.goToPage(ui, page)
    local Event = require("ui/event")
    page = math.max(1, math.min(Progress.pageCount(ui), page))
    ui:handleEvent(Event:new("GotoPage", page))
end

return Progress
