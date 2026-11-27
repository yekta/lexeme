--[[
Kindle locations for the book being read, as the footer, the toolbar, Go To and the notebook show
them. Each book gets them one of three ways, set up when it opens:

- A book converted from a Kindle document marks each of the Kindle's location labels with an
  empty element, <span id="lexeme_loc_N"/> (or, for a label where a spine item or an element with
  an id starts, that), and META-INF/lexeme-locations.txt says which spine item holds which labels
  (conversion/drop_page_list.py writes it). A position's location is the last label at or above
  it, found by a binary search among the labels of its spine item: a few lookups, and no laying
  out. Exact. Its sidecar says lexeme_locations = "kindle".
- A book converted before that index existed lists the same anchors as its page list, and gets
  KOReader's page labels. Exact too, but crengine places every page-list entry whenever the book
  is laid out, which takes minutes on a long book; reconverted copies replace these.
- Any other book: the Kindle's count (a MOBI's from its header, 150 bytes of text a location;
  otherwise a location per 110 characters, estimated from a few pages) spread over the book's
  height. A MOBI set up before this keeps the synthetic page map it was given then.

A book with its own (print) page list keeps it, and has no locations. A converted book's print
pages, if it has any, are in lexeme_print_pages.tsv beside its sidecar.
]]
local DocSettings = require("docsettings")
local Event = require("ui/event")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local Locations = {}

local CHARS_PER_LOCATION = 110
local MOBI_BYTES_PER_LOCATION = 150
local INDEX_FILE = "META-INF/lexeme-locations.txt"
-- A line per print page: its label, a tab, and the id of the anchor where it starts.
local PRINT_FILE = "lexeme_print_pages.tsv"

-- What each open document's locations come from, by document.
local books = setmetatable({}, { __mode = "k" })

local function u16(s, i)
    local a, b = s:byte(i, i + 1)
    return a * 256 + b
end

local function u32(s, i)
    local a, b, c, d = s:byte(i, i + 3)
    return ((a * 256 + b) * 256 + c) * 256 + d
end

-- The Kindle's location count for a MOBI file: its text length (from the first record's header,
-- the length the Kindle's catalog keeps as the book's content size) over 150 bytes.
function Locations.mobiCount(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local ok, count = pcall(function()
        local head = f:read(78)
        if not head or #head < 78 or head:sub(61, 68) ~= "BOOKMOBI" then return nil end
        local list = f:read(8)
        f:seek("set", u32(list, 1))
        local r0 = f:read(16)
        if u16(r0, 13) ~= 0 then return nil end -- encrypted
        local text_length = u32(r0, 5)
        if text_length < 1 then return nil end
        return math.floor((text_length - 1) / MOBI_BYTES_PER_LOCATION) + 1
    end)
    f:close()
    return ok and count or nil
end

-- Where the Kindle's own reader left a MOBI book: a byte offset in the text, the first number of
-- "lpr" in the book's .sdr/*.mbs, or *.azw3f for an AZW3 (KRDS files: typed values, a field
-- named after 0xFE).
function Locations.amazonOffset(file)
    local sdr = file:gsub("%.[^.]+$", "") .. ".sdr"
    if lfs.attributes(sdr, "mode") ~= "directory" then return nil end
    for entry in lfs.dir(sdr) do
        if entry:match("%.mbs$") or entry:match("%.azw3f$") then
            local f = io.open(sdr .. "/" .. entry, "rb")
            local data = f and f:read("*a")
            if f then f:close() end
            local at = data and data:find("\254\0\0\3lpr", 1, true)
            if at then
                local pos = at + 7
                -- The field's values: a version byte, then the position string.
                for _ = 1, 4 do
                    local kind = data:byte(pos)
                    if kind == 7 then
                        pos = pos + 2
                    elseif kind == 1 then
                        pos = pos + 5
                    elseif kind == 2 then
                        pos = pos + 9
                    elseif kind == 3 and data:byte(pos + 1) == 0 then
                        local len = u16(data, pos + 2)
                        local offset = tonumber(data:sub(pos + 4, pos + 3 + len):match("^(%d+)"))
                        return offset
                    else
                        break
                    end
                end
            end
        end
    end
end

local function isMobi(file)
    local ext = (file or ""):lower():match("%.(%w+)$")
    return ext == "mobi" or ext == "azw" or ext == "azw3" or ext == "prc"
end

-- Anchors -------------------------------------------------------------------------

-- The book's label index: its spine items with labels, ascending, the label ranges in each, and
-- the labels whose target isn't their lexeme_loc_N anchor ("^" for the spine item's start, or
-- "#<id>").
local function readIndex(document)
    local ok, text = pcall(document.getDocumentFileContent, document, INDEX_FILE)
    if not ok or type(text) ~= "string" or not text:match("^lexeme%-locations 1\n") then return nil end
    local index = { spines = {}, ranges = {}, first = {}, last = {}, labels = {}, targets = {} }
    for spine, ranges, rest in text:gmatch("\n(%d+) ([%d,%-]+)([^\n]*)") do
        spine = tonumber(spine)
        table.insert(index.spines, spine)
        index.ranges[spine] = ranges
        index.first[spine] = tonumber(ranges:match("^(%d+)"))
        index.last[spine] = tonumber(ranges:match("(%d+)$"))
        for label, target in rest:gmatch("(%d+):(%S+)") do
            index.targets[tonumber(label)] = target
        end
    end
    if #index.spines == 0 then return nil end
    index.total = index.last[index.spines[#index.spines]]
    return index
end

-- The labels anchored in a spine item, ascending.
local function labelsIn(index, spine)
    local labels = index.labels[spine]
    if labels then return labels end
    labels = {}
    for range in index.ranges[spine]:gmatch("[^,]+") do
        local from, to = range:match("^(%d+)%-(%d+)$")
        from = tonumber(from or range)
        to = tonumber(to or range)
        for n = from, to do labels[#labels + 1] = n end
    end
    index.labels[spine] = labels
    return labels
end

-- The row of the last spine item with anchors at or before `spine`, or 0.
local function rowAtOrBefore(index, spine)
    local lo, hi, row = 1, #index.spines, 0
    while lo <= hi do
        local mid = math.floor((lo + hi) / 2)
        if index.spines[mid] <= spine then
            row = mid
            lo = mid + 1
        else
            hi = mid - 1
        end
    end
    return row
end

-- Where a label is. crengine makes spine item i /body/DocFragment[i + 1], and gives an element
-- of it with id X the id "_doc_fragment_<i>_ X".
local function anchor(document, index, spine, label)
    local target = index.targets[label]
    if target == "^" then
        return document:getNormalizedXPointer(string.format("/body/DocFragment[%d].0", spine + 1)) or nil
    end
    local id = target and target:sub(2) or "lexeme_loc_" .. label
    return document:getNormalizedXPointer(string.format("#_doc_fragment_%d_ %s", spine, id)) or nil
end

-- The label at xp, as crengine numbers page-list entries: the last anchor no lower than xp.
local function anchorLabelAt(document, index, xp)
    local fragment = type(xp) == "string" and tonumber(xp:match("^/body/DocFragment%[(%d+)%]"))
    if not fragment then return nil end
    local spine = fragment - 1
    local row = rowAtOrBefore(index, spine)
    if row == 0 then return 1 end
    local previous = function()
        local before = index.spines[row - 1]
        return before and index.last[before] or 1
    end
    if index.spines[row] < spine then return index.last[index.spines[row]] end
    local y = document:getPosFromXPointer(xp)
    local labels = labelsIn(index, spine)
    local first = anchor(document, index, spine, labels[1])
    if not first or document:getPosFromXPointer(first) > y then return previous() end
    local lo, hi, best = 2, #labels, 1
    while lo <= hi do
        local mid = math.floor((lo + hi) / 2)
        local at = anchor(document, index, spine, labels[mid])
        if at and document:getPosFromXPointer(at) <= y then
            best = mid
            lo = mid + 1
        else
            hi = mid - 1
        end
    end
    return labels[best]
end

-- Where label n is, or the nearest anchored label before it.
local function anchorOf(document, index, n)
    local lo, hi, row = 1, #index.spines, 0
    while lo <= hi do
        local mid = math.floor((lo + hi) / 2)
        if index.first[index.spines[mid]] <= n then
            row = mid
            lo = mid + 1
        else
            hi = mid - 1
        end
    end
    if row == 0 then return nil end
    local spine = index.spines[row]
    local labels = labelsIn(index, spine)
    local lo2, hi2, best = 1, #labels, 1
    while lo2 <= hi2 do
        local mid = math.floor((lo2 + hi2) / 2)
        if labels[mid] <= n then
            best = mid
            lo2 = mid + 1
        else
            hi2 = mid - 1
        end
    end
    return anchor(document, index, spine, labels[best])
end

-- Height ----------------------------------------------------------------------------

-- A location per 110 characters, from the text of a few pages spread through the book.
local function estimateCount(document)
    local pages = document:getPageCount()
    if not pages or pages < 1 then return nil end
    local bytes, samples = 0, 0
    for i = 1, 9 do
        local page = math.max(1, math.floor(pages * i / 10))
        if page < pages then
            local from, to = document:getPageXPointer(page), document:getPageXPointer(page + 1)
            local text = document:getTextFromXPointers(from, to)
            if text then
                bytes = bytes + #text
                samples = samples + 1
            end
        end
    end
    if samples == 0 then return nil end
    return math.max(1, math.floor(bytes / samples * pages / CHARS_PER_LOCATION) + 1)
end

local function heightLocation(document, count, y)
    local height = document.info and document.info.doc_height
    if not height or height <= 0 then return 1 end
    return math.max(1, math.min(count, math.floor(y / height * count) + 1))
end

-- Page labels ---------------------------------------------------------------------

local function record(ui, kind, count, labels)
    local pagemap, settings = ui.pagemap, ui.doc_settings
    local same = count == labels
    pagemap.use_page_labels = same
    pagemap.show_page_labels = false
    settings:saveSetting("pagemap_use_page_labels", same)
    settings:saveSetting("pagemap_show_page_labels", false)
    settings:saveSetting("lexeme_locations", kind)
    settings:saveSetting("lexeme_location_count", count)
    settings:saveSetting("lexeme_location_labels", labels)
    UIManager:broadcastEvent(Event:new("UsePageLabelsUpdated"))
end

-- Print pages ------------------------------------------------------------------------
-- Kept out of the sidecar, which KOReader rewrites whole at every close, sleep and periodic save
-- (4 s for Woolf's 16,000 print pages) and which Home reads for every book in the history.

local function printFile(ui)
    return DocSettings:getSidecarDir(ui.document.file) .. "/" .. PRINT_FILE
end

-- Books converted before the file existed have their print pages in the sidecar: they move out.
local function moveOutPrintPages(ui)
    local settings = ui.doc_settings
    local pages = settings:readSetting("lexeme_print_page_map")
    if type(pages) ~= "table" then return end
    local lines = {}
    for i, page in ipairs(pages) do
        lines[i] = tostring(page.label):gsub("[\t\n]", " ") .. "\t" .. tostring(page.target) .. "\n"
    end
    local path = printFile(ui)
    local file = io.open(path .. ".part", "wb")
    local written = file and file:write(table.concat(lines)) and file:close()
    if not (written and os.rename(path .. ".part", path)) then
        logger.warn("Lexeme: couldn't write", path)
        return
    end
    settings:delSetting("lexeme_print_page_map")
    logger.info("Lexeme: moved", #pages, "print pages out of the sidecar")
end

-- The book's print pages as { label, target } in order, read once; nil without any.
local function printPages(ui, book)
    if book.print_pages == nil then
        local pages = {}
        local file = io.open(printFile(ui), "rb")
        if file then
            for line in file:lines() do
                local label, target = line:match("^([^\t]*)\t(.+)$")
                if label then pages[#pages + 1] = { label = label, target = target } end
            end
            file:close()
        end
        book.print_pages = #pages > 0 and pages or false
    end
    return book.print_pages or ui.doc_settings:readSetting("lexeme_print_page_map")
end

-- Setup -----------------------------------------------------------------------------

-- Gives the book its locations when it opens.
function Locations.setup(ui)
    if not (ui.rolling and ui.doc_settings) then return end
    moveOutPrintPages(ui)
    local document, settings = ui.document, ui.doc_settings
    local kind = settings:readSetting("lexeme_locations")
    local index = readIndex(document)
    if index then
        local labels = settings:readSetting("lexeme_location_labels") or index.total
        local count = settings:readSetting("lexeme_location_count") or labels
        books[document] = { how = "anchors", index = index, count = count, labels = labels, memo = {} }
        if kind ~= "kindle" then
            settings:saveSetting("lexeme_locations", "kindle")
            settings:saveSetting("lexeme_location_count", count)
            settings:saveSetting("lexeme_location_labels", labels)
        end
        return
    end
    if kind == "height" then
        books[document] = { how = "height", count = settings:readSetting("lexeme_location_count") }
        return
    end
    if kind and ui.pagemap and ui.pagemap.has_pagemap then
        books[document] = { how = "labels" }
        -- Books set up before the count was kept get it now, without rebuilding anything.
        if not settings:readSetting("lexeme_location_count") then
            local labels = tonumber(ui.pagemap:getLastPageLabel(true)) or 0
            local count = kind == "mobi" and Locations.mobiCount(document.file) or labels
            if labels > 0 and count then record(ui, kind, count, labels) end
        end
        return
    end
    if ui.pagemap and ui.pagemap.has_pagemap_document_provided then return end
    local mobi = isMobi(document.file)
    local count = mobi and Locations.mobiCount(document.file) or estimateCount(document)
    if not count then return end
    settings:saveSetting("lexeme_locations", "height")
    settings:saveSetting("lexeme_location_count", count)
    books[document] = { how = "height", count = count }
    logger.info("Lexeme: Kindle locations:", count, mobi and "(MOBI)" or "(estimated)")
    -- A MOBI book KOReader opens for the first time starts where the Kindle's reader left it.
    local offset = mobi and document.is_new and Locations.amazonOffset(document.file)
    if offset and offset > 0 then
        local location = math.min(count, math.floor(offset / MOBI_BYTES_PER_LOCATION) + 1)
        UIManager:nextTick(function()
            if ui.document then Locations.goTo(ui, location) end
        end)
        logger.info("Lexeme: opening at the Kindle reader's location", location)
    end
end

function Locations.available(ui)
    return ui.rolling and ui.document and books[ui.document] ~= nil
end

-- The book's location count, and the number of page labels they're spread over.
local function scale(ui)
    local settings = ui.doc_settings
    local labels = settings:readSetting("lexeme_location_labels")
    local count = settings:readSetting("lexeme_location_count")
    if not (labels and count) then
        labels = tonumber(ui.pagemap:getLastPageLabel(true)) or 1
        count = labels
    end
    return count, math.max(1, labels)
end

local function labelToLocation(count, labels, label)
    if not label then return nil end
    if count == labels then return label end
    return math.min(count, math.floor((label - 1) * count / labels) + 1)
end

-- The location at a position in the book (an xpointer).
function Locations.at(ui, xp)
    local book = ui.document and books[ui.document]
    if not book or type(xp) ~= "string" then return nil end
    if book.how == "anchors" then
        -- Which anchors share a line with xp depends on the layout.
        local layout = ui.document:getPageCount()
        if book.memo_layout ~= layout then
            book.memo, book.memo_layout = {}, layout
        end
        local label = book.memo[xp]
        if label == nil then
            local ok, found = pcall(anchorLabelAt, ui.document, book.index, xp)
            label = ok and found or false
            if not ok then logger.warn("Lexeme: location lookup", found) end
            book.memo[xp] = label
        end
        return label and labelToLocation(book.count, book.labels, label) or nil
    elseif book.how == "height" then
        return book.count and heightLocation(ui.document, book.count, ui.document:getPosFromXPointer(xp)) or nil
    end
    local count, labels = scale(ui)
    return labelToLocation(count, labels, tonumber(ui.pagemap:getXPointerPageLabel(xp, true)))
end

-- The location at the top of the page, and the book's last location.
function Locations.current(ui)
    local book = ui.document and books[ui.document]
    if not book then return nil end
    if book.how == "height" then
        if not book.count then return nil end
        return heightLocation(ui.document, book.count, ui.document:getCurrentPos()), book.count
    end
    local location = Locations.at(ui, ui.document:getXPointer())
    if book.how == "anchors" then return location or 1, book.count end
    return location or 1, (scale(ui))
end

function Locations.goTo(ui, location)
    local book = ui.document and books[ui.document]
    if not book then return end
    if book.how == "anchors" then
        local label = book.count == book.labels and location
            or math.floor((location - 1) * book.labels / book.count) + 1
        local xp = anchorOf(ui.document, book.index, label)
        if xp then ui:handleEvent(Event:new("GotoXPointer", xp)) end
        return
    elseif book.how == "height" then
        if not book.count then return end
        ui:handleEvent(Event:new("GotoPercent", (location - 1) / book.count * 100))
        return
    end
    local count, labels = scale(ui)
    local label = count == labels and location or math.floor((location - 1) * labels / count) + 1
    local _, page = ui.pagemap:getPageLabelProps(tostring(label))
    if page then ui:handleEvent(Event:new("GotoPage", page)) end
end

-- Whether the book's pages are the Kindle's locations' book: a converted book, whose print pages
-- (if it has them) come from its sidecar rather than KOReader's page labels.
function Locations.replacesPages(ui)
    local book = ui.document and books[ui.document]
    return book ~= nil and book.how ~= "height"
end

-- The print edition's page at the current page, from a converted book's print pages (label and
-- position of each), and the last one; nil without any. A binary search places only the few
-- entries it compares.
function Locations.printPage(ui)
    local document = ui.document
    local book = document and ui.doc_settings and books[document]
    if not book then return nil end
    local map = printPages(ui, book)
    if type(map) ~= "table" or #map == 0 then return nil end
    local page = document:getCurrentPage()
    local layout = document:getPageCount()
    if not (book.print and book.print.layout == layout) then
        book.print = { layout = layout, starts = {}, labels = {} }
    end
    local cache = book.print
    if cache.labels[page] == nil then
        local function startOf(i)
            local start = cache.starts[i]
            if start == nil then
                local xp = document:getNormalizedXPointer(map[i].target)
                start = xp and document:getPageFromXPointer(xp) or math.huge
                cache.starts[i] = start
            end
            return start
        end
        local lo, hi, best = 1, #map, 0
        while lo <= hi do
            local mid = math.floor((lo + hi) / 2)
            if startOf(mid) <= page then
                best = mid
                lo = mid + 1
            else
                hi = mid - 1
            end
        end
        cache.labels[page] = best > 0 and map[best].label or false
    end
    return cache.labels[page] or nil, map[#map].label
end

return Locations
