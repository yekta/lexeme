--[[
The Kindle's "Loc" numbers. A book converted from Amazon's own copy (its KFX in
Downloads/Items01, named like the book plus an id) takes them from that copy's
location map, so they are the Kindle's exactly. Any other book gets the rule
Amazon's map follows: a location every 150 bytes of its HTML, which is the text
and about 20 bytes for each paragraph. A MOBI file says how long its HTML is, so
its count is exact and the estimate only spreads it over the text.
]]
local lfs = require("libs/libkoreader-lfs")
local utf8proc = require("ffi/utf8proc")

local Books = require("lexeme/books")
local Kfx = require("lexeme/kfx")

local Event = require("ui/event")
local UIManager = require("ui/uimanager")

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

local function u16(s, i)
    local a, b = s:byte(i, i + 1)
    return a * 256 + b
end

local function u32(s, i)
    local a, b, c, d = s:byte(i, i + 3)
    return ((a * 256 + b) * 256 + c) * 256 + d
end

local function isMobi(file)
    local ext = (file:match("%.(%w+)$") or ""):lower()
    return ext == "mobi" or ext == "azw" or ext == "azw3" or ext == "prc"
end

-- A MOBI file's HTML length, from its first record's header; nil when encrypted or not a MOBI.
local function mobiTextLength(file)
    local f = io.open(file, "rb")
    if not f then return nil end
    local ok, length = pcall(function()
        local head = f:read(78)
        if not head or #head < 78 or head:sub(61, 68) ~= "BOOKMOBI" then return nil end
        f:seek("set", u32(f:read(8), 1))
        local record = f:read(16)
        if u16(record, 13) ~= 0 then return nil end
        local length = u32(record, 5)
        return length > 0 and length or nil
    end)
    f:close()
    return ok and length or nil
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
        local bytes = htmlBytes(document:getTextFromXPointers(document:getPageXPointer(1), last) or "")
        local length = isMobi(document.file) and mobiTextLength(document.file)
        if length and bytes > 0 then
            entry.measure = function(text) return htmlBytes(text) * length / bytes end
            bytes = length
        end
        entry.total = math.floor(bytes / BYTES_PER_LOCATION) + 1
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

-- A highlight's or bookmark's location, as recorded or worked out now.
function Locations.ofAnnotation(ui, item)
    if not ui.rolling then return end
    if item.lexeme_location then return item.lexeme_location end
    local xpointer = annotationXPointer(item)
    return xpointer and locationOf(book(ui), ui.document, xpointer)
end

-- Turns to the page `location` is on.
function Locations.goTo(ui, location)
    if not ui.rolling then return end
    local entry, document = book(ui), ui.document
    local low, high = 1, document:getPageCount()
    while low < high do
        local mid = math.floor((low + high + 1) / 2)
        if locationOf(entry, document, document:getPageXPointer(mid)) <= location then low = mid else high = mid - 1 end
    end
    ui:handleEvent(Event:new("GotoPage", low))
end

-- Where Amazon's reader left a MOBI book: a byte offset into its HTML, the first number of "lpr" in
-- the book's .sdr/*.mbs (a KRDS file: typed values, a field named after 0xFE).
local function amazonOffset(file)
    local sdr = file:gsub("%.[^.]+$", "") .. ".sdr"
    if lfs.attributes(sdr, "mode") ~= "directory" then return nil end
    for name in lfs.dir(sdr) do
        local f = name:match("%.mbs$") and io.open(sdr .. "/" .. name, "rb")
        local data = f and f:read("*a")
        if f then f:close() end
        local at = data and data:find("\254\0\0\3lpr", 1, true)
        local pos = at and at + 7
        -- The field's values: a version byte, then the position string.
        for _ = 1, pos and 4 or 0 do
            local kind = data:byte(pos)
            if kind == 7 then
                pos = pos + 2
            elseif kind == 1 then
                pos = pos + 5
            elseif kind == 2 then
                pos = pos + 9
            elseif kind == 3 and data:byte(pos + 1) == 0 then
                return tonumber(data:sub(pos + 4, pos + 3 + u16(data, pos + 2)):match("^(%d+)"))
            else
                break
            end
        end
    end
end

-- A MOBI book opened in KOReader for the first time starts where Amazon's reader left it.
function Locations.openWhereAmazonLeftOff(ui)
    if not (ui.rolling and ui.document.is_new and isMobi(ui.document.file)) then return end
    local offset = amazonOffset(ui.document.file)
    if not offset or offset <= 0 then return end
    UIManager:nextTick(function()
        if ui.document then Locations.goTo(ui, math.floor(offset / BYTES_PER_LOCATION) + 1) end
    end)
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
    local next_page = page < count and document:getPageXPointer(page + 1) or false
    noted[layout][page] = { document:getPageXPointer(page), next_page }
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
                local ok, total, found = pcall(Background.await, function()
                    return measureClosedBook(file, xpointers)
                end)
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
