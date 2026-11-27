--[[
The Kindle's "Loc" numbers. A book converted from Amazon's own copy (its KFX in
Downloads/Items01, named like the book plus an id) takes them from that copy's
location map, so they are the Kindle's exactly. Any other book gets the rule
Amazon's map follows: a location every 150 bytes of its HTML, which is the text
and about 20 bytes for each paragraph.
]]
local lfs = require("libs/libkoreader-lfs")
local utf8proc = require("ffi/utf8proc")

local Books = require("lexeme/books")
local Kfx = require("lexeme/kfx")

local Locations = {}

local BYTES_PER_LOCATION = 150
local BYTES_PER_PARAGRAPH = 20

local books = setmetatable({}, { __mode = "k" })

-- Amazon names its copies by the original file in decomposed Unicode, sometimes with a space in front.
local function normalized(name)
    local ok, nfc = pcall(utf8proc.normalize_NFC, name)
    return ((ok and nfc or name):gsub("^%s+", ""):gsub("%s+$", ""))
end

local function amazonCopy(file)
    local stem = file:match("([^/]+)%.[^./]+$")
    local dir = Books.homeDir() .. "/Downloads/Items01"
    if not stem or lfs.attributes(dir, "mode") ~= "directory" then return end
    stem = normalized(stem)
    for name in lfs.dir(dir) do
        local copy = name:match("^(.+)_%w+%.kfx$")
        if copy and normalized(copy) == stem then return dir .. "/" .. name end
    end
end

-- What a stretch of text weighs: its HTML's bytes, estimated, for a book without Amazon's map.
local function htmlBytes(text)
    local _, paragraphs = text:gsub("\n", "")
    return #text + BYTES_PER_PARAGRAPH * paragraphs
end

local function book(ui)
    local document = ui.document
    if books[document] then return books[document] end
    local copy = amazonCopy(document.file)
    local starts = copy and Kfx.locationStarts(copy)
    local entry = { starts = starts, measure = starts and Kfx.length or htmlBytes }
    if starts then
        entry.total = #starts
    else
        local last = document:getPageXPointer(document:getPageCount())
        entry.total = math.floor(htmlBytes(document:getTextFromXPointers(document:getPageXPointer(1), last) or "")
            / BYTES_PER_LOCATION) + 1
    end
    books[document] = entry
    return entry
end

-- How much text comes before xpointer, carried on from the last place measured so a page turn reads one page.
local function measureBefore(entry, document, xpointer)
    local from = entry.measured_at or document:getPageXPointer(1)
    local order = document:compareXPointers(from, xpointer)
    if not order then
        from, entry.measured = document:getPageXPointer(1), 0
        order = document:compareXPointers(from, xpointer)
    end
    entry.measured = entry.measured or 0
    if order == 1 then
        entry.measured = entry.measured + entry.measure(document:getTextFromXPointers(from, xpointer) or "")
    elseif order == -1 then
        entry.measured = entry.measured - entry.measure(document:getTextFromXPointers(xpointer, from) or "")
    end
    entry.measured_at = xpointer
    return entry.measured
end

local function locationAt(starts, chars)
    local low, high = 1, #starts
    while low <= high do
        local mid = math.floor((low + high) / 2)
        if starts[mid] <= chars then low = mid + 1 else high = mid - 1 end
    end
    return math.max(1, high)
end

local function locationOf(entry, document, xpointer)
    local measured = measureBefore(entry, document, xpointer)
    return entry.starts and locationAt(entry.starts, measured) or math.floor(measured / BYTES_PER_LOCATION) + 1
end

-- The location the page starts in, and how many the book has; nil for books laid out in fixed pages.
function Locations.current(ui)
    if not ui.rolling then return end
    local entry = book(ui)
    local xpointer = ui.document:getXPointer()
    if entry.xpointer ~= xpointer then
        entry.xpointer = xpointer
        entry.current = locationOf(entry, ui.document, xpointer)
    end
    return entry.current, entry.total
end

local function annotationXPointer(item)
    local xpointer = item.pos0 or item.page
    return type(xpointer) == "string" and xpointer or nil
end

-- Where each page read starts and where the next one does, keyed by the page count of the layout it was read in.
local PAGE_XPOINTERS, PAGE_LOCATIONS = "lexeme_page_xpointers", "lexeme_page_locations"

-- Notes where a page turned to starts; it becomes locations when the book's locations are next worked out.
function Locations.notePage(ui, page)
    if not ui.rolling or not ui.document or not ui.doc_settings then return end
    local document, settings = ui.document, ui.doc_settings
    local count = document:getPageCount()
    local layout = tostring(count)
    local located = settings:readSetting(PAGE_LOCATIONS)
    if located and located[layout] and located[layout][page] then return end
    local noted = settings:readSetting(PAGE_XPOINTERS) or {}
    noted[layout] = noted[layout] or {}
    if noted[layout][page] then return end
    noted[layout][page] = { document:getPageXPointer(page), page < count and document:getPageXPointer(page + 1) or false }
    settings:saveSetting(PAGE_XPOINTERS, noted)
end

-- The places a book's settings still need located: its highlights and bookmarks, and the pages noted.
local function unlocated(settings, annotations)
    local xpointers, seen = {}, {}
    local function add(xpointer)
        if xpointer and not seen[xpointer] then
            seen[xpointer] = true
            table.insert(xpointers, xpointer)
        end
    end
    for _, item in ipairs(annotations) do
        if not item.lexeme_location then add(annotationXPointer(item)) end
    end
    for _, pages in pairs(settings:readSetting(PAGE_XPOINTERS) or {}) do
        for _, page in pairs(pages) do
            add(page[1])
            add(page[2] or nil)
        end
    end
    return xpointers
end

-- Each of `xpointers`' location, measured in reading order so each step reads only the text between two of them.
local function locate(entry, document, xpointers)
    table.sort(xpointers, function(a, b) return document:compareXPointers(a, b) == 1 end)
    local found = {}
    for _, xpointer in ipairs(xpointers) do found[xpointer] = locationOf(entry, document, xpointer) end
    return found
end

-- Saves what `found` says about the book's places, with its location count (false when it couldn't be measured).
local function saveLocated(settings, annotations, found, total)
    for _, item in ipairs(annotations) do
        local location = found[annotationXPointer(item) or ""]
        if not item.lexeme_location and location then item.lexeme_location = location end
    end
    local located = settings:readSetting(PAGE_LOCATIONS) or {}
    for layout, pages in pairs(settings:readSetting(PAGE_XPOINTERS) or {}) do
        located[layout] = located[layout] or {}
        for page, xpointers in pairs(pages) do
            local start = found[xpointers[1]]
            local stop = xpointers[2] and found[xpointers[2]] or (total and total + 1)
            if start and stop then located[layout][page] = { start, math.max(stop, start + 1) } end
        end
    end
    settings:saveSetting(PAGE_LOCATIONS, located)
    settings:delSetting(PAGE_XPOINTERS)
    settings:saveSetting("lexeme_locations", total or false)
end

--[[
Keeps the open book's location count, and the locations of its highlights,
bookmarks and the pages read, with the book's settings, for Lexeme. Only what's
missing is worked out, so this costs little once done.
]]
function Locations.record(ui)
    if not ui.rolling or not ui.annotation then return end
    local annotations = ui.annotation.annotations or {}
    local xpointers = unlocated(ui.doc_settings, annotations)
    if #xpointers == 0 and ui.doc_settings:has("lexeme_locations") then return end
    local entry = book(ui)
    saveLocated(ui.doc_settings, annotations, locate(entry, ui.document, xpointers), entry.total)
end

-- Opens a book without showing it and works out its location count and where each of `xpointers` falls.
local function measureClosedBook(file, xpointers)
    local document = require("document/documentregistry"):openDocument(file)
    if not document then return end
    local ok, total, found = pcall(function()
        document:loadDocument()
        document:render()
        local entry = book({ document = document })
        return entry.total, locate(entry, document, xpointers)
    end)
    document:close()
    if ok then return total, found end
end

--[[
Does for every book that isn't open what Locations.record does for the open
one, so Lexeme gets locations without the book being opened. A book takes
seconds to measure, so each is measured in a child process; this runs inside a
background task. A book that can't be measured is marked and left alone.
]]
function Locations.recordClosedBooks(open_file)
    local Background = require("lexeme/background")
    local DocSettings = require("docsettings")
    local DocumentRegistry = require("document/documentregistry")
    for _, history in ipairs(require("readhistory").hist) do
        local file = history.file
        local provider = file and file ~= open_file and lfs.attributes(file, "mode") == "file"
            and DocSettings:hasSidecarFile(file) and DocumentRegistry:getProvider(file)
        if provider and provider.provider == "crengine" then
            local settings = DocSettings:open(file)
            local xpointers = unlocated(settings, settings:readSetting("annotations") or {})
            if #xpointers > 0 or settings:hasNot("lexeme_locations") then
                local ok, total, found = pcall(Background.await, function() return measureClosedBook(file, xpointers) end)
                -- Read again: the book may have been opened and changed meanwhile.
                settings = DocSettings:open(file)
                local annotations = settings:readSetting("annotations") or {}
                saveLocated(settings, annotations, ok and found or {}, ok and total or nil)
                settings:saveSetting("annotations", annotations)
                settings:flush()
            end
        end
    end
end

-- Where a page read lies in locations: as noted while reading, or else in proportion to the page's place in the book.
function Locations.ofPageRead(located, total, page, total_pages)
    local exact = located and located[tostring(total_pages)] and located[tostring(total_pages)][page]
    if exact then return exact[1], exact[2] end
    if not total or total_pages <= 0 or page < 1 then return end
    local start = math.floor((page - 1) / total_pages * total) + 1
    return start, math.max(start + 1, math.floor(page / total_pages * total) + 1)
end

-- 1514 as "1,514", as the Kindle writes it.
function Locations.format(n)
    local text = tostring(n)
    while true do
        local grouped, count = text:gsub("^(%d+)(%d%d%d)", "%1,%2")
        if count == 0 then return text end
        text = grouped
    end
end

return Locations
