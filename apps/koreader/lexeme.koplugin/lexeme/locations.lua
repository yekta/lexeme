--[[
The Kindle's "Loc" numbers. A location starts every so many characters of the
book's text, where Amazon's location map says; a place in the book is in the
last location starting at or before it.

- A book whose conversion marked the Kindle's locations in its text
  (<span id="lexeme_loc_N"/>, listed by spine item in
  META-INF/lexeme-locations.txt) takes them from those marks, found in reading
  order without laying anything out. The conversion also leaves
  lexeme_kindle_locations.txt beside the book's settings, with what the marks
  don't say themselves (see Marks below): the book's location count, the marks
  moved to the start of their word, and, in a long book that marks only some
  locations, where the others start.
- A book converted from Amazon's own copy (its KFX in Downloads/Items01, named
  like the book plus an id) takes them from that copy's location map: where each
  location starts, as a count of the visible characters before it.
- Any other book gets the rule Amazon's map follows: a location every 150 bytes
  of its HTML, which is the text and about 20 bytes for each paragraph. A MOBI
  file says how long its HTML is, so its count is exact and the estimate only
  spreads it over the text.

Measuring a long book's text takes seconds on a Kindle, so what was measured is
kept: Amazon's map once read, beside the book's settings; the book's size, and
a few places with the measure up to them, in its settings. A measure starts
from the nearest of those places.
]]
local DocSettings = require("docsettings")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")
local utf8proc = require("ffi/utf8proc")

local Books = require("lexeme/books")
local Kfx = require("lexeme/kfx")

local Event = require("ui/event")
local UIManager = require("ui/uimanager")

local Locations = {}

local BYTES_PER_LOCATION = 150
local BYTES_PER_PARAGRAPH = 20
local INDEX_FILE = "META-INF/lexeme-locations.txt"
-- Beside a book's settings: what its location marks don't say, and Amazon's map read from its copy.
local MARKS_FILE = "lexeme_kindle_locations.txt"
local MAP_FILE = "lexeme_amazon_location_map.txt"
-- Beside a converted book's settings: its print pages, a line each: the label, a tab, the id where it starts.
local PRINT_FILE = "lexeme_print_pages.tsv"
-- How many measured places a book keeps, and how far apart (in what's measured) they are at least.
local MAX_PLACES, PLACE_SPACING = 48, 20000

local books = setmetatable({}, { __mode = "k" })

local function besideSettings(file, name)
    return DocSettings:getSidecarDir(file) .. "/" .. name
end

local function readFile(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local data = f:read("*a")
    f:close()
    return data
end

local function writeFile(path, data)
    local f = io.open(path .. ".part", "wb")
    local ok = f and f:write(data) and f:close()
    return ok and os.rename(path .. ".part", path) or false
end

-- Amazon names its copies by the original file in decomposed Unicode, sometimes with a space in front.
local function normalized(name)
    local ok, nfc = pcall(utf8proc.normalize_NFC, name)
    return ((ok and nfc or name):gsub("^%s+", ""):gsub("%s+$", ""))
end

-- Amazon's copies by the name of the book they're of, listed again only when the folder changes.
local copies = {}

local function amazonCopy(file)
    local stem = file:match("([^/]+)%.[^./]+$")
    local dir = Books.homeDir() .. "/Downloads/Items01"
    local modification = lfs.attributes(dir, "modification")
    if not stem or not modification then return end
    if copies.dir ~= dir or copies.modification ~= modification then
        copies = { dir = dir, modification = modification, by_stem = {} }
        for name in lfs.dir(dir) do
            local copy = name:match("^(.+)_%w+%.kfx$")
            if copy then copies.by_stem[normalized(copy)] = dir .. "/" .. name end
        end
    end
    return copies.by_stem[normalized(stem)]
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

-- The last of `count` items for which `fits(i)` holds, they being all true and then all false; 0 if none.
local function lastFitting(count, fits)
    local low, high = 1, count
    while low <= high do
        local mid = math.floor((low + high) / 2)
        if fits(mid) then low = mid + 1 else high = mid - 1 end
    end
    return high
end

-- Marks ---------------------------------------------------------------------------------
--[[
A mark sits where its location starts, except that a mark inside a word was
moved to the word's start (a long press takes an element for a word's edge), and
that a long book marks only some of its locations. lexeme_kindle_locations.txt
says both:

    lexeme-kindle-locations 1
    count <the book's location count>
    moved <label>:<n> ...        the location starts n visible characters after its mark
    after <label> <offset> ...   where the locations up to the next one marked start, in
                                 visible characters after this mark

A place is in the location of the last mark at or before it, unless it comes
before where that location starts, or one of the locations after it starts
before the place.
]]

-- The book's location marks: its spine items that have some, ascending, the locations marked in
-- each as ranges ("1-40,42"), and the locations whose mark isn't their own lexeme_loc_N element
-- ("^" for where the spine item starts, "#<id>" for an element with that id).
local function readIndex(document)
    if not document.getDocumentFileContent then return nil end
    local ok, text = pcall(document.getDocumentFileContent, document, INDEX_FILE)
    if not ok or type(text) ~= "string" or not text:match("^lexeme%-locations 1\n") then return nil end
    local index = { spines = {}, ranges = {}, first = {}, last = {}, labels = {}, targets = {}, marks = {} }
    for number, ranges, rest in text:gmatch("\n(%d+) ([%d,%-]+)([^\n]*)") do
        local spine = tonumber(number)
        table.insert(index.spines, spine)
        index.ranges[spine] = ranges
        index.first[spine] = tonumber(ranges:match("^(%d+)"))
        index.last[spine] = tonumber(ranges:match("(%d+)$"))
        for label, target in rest:gmatch("(%d+):(%S+)") do index.targets[tonumber(label)] = target end
    end
    if #index.spines == 0 then return nil end
    index.total = index.last[index.spines[#index.spines]]
    return index
end

-- The locations marked in a spine item, ascending.
local function labelsIn(index, spine)
    if index.labels[spine] then return index.labels[spine] end
    local labels = {}
    for range in index.ranges[spine]:gmatch("[^,]+") do
        local from, to = range:match("^(%d+)%-(%d+)$")
        for n = tonumber(from or range), tonumber(to or range) do labels[#labels + 1] = n end
    end
    index.labels[spine] = labels
    return labels
end

-- Where a location is marked. crengine makes spine item i /body/DocFragment[i + 1], and gives an
-- element of it with id X the id "_doc_fragment_<i>_ X".
local function mark(document, index, spine, label)
    local found = index.marks[label]
    if found == nil then
        local target = index.targets[label]
        if target == "^" then
            found = document:getNormalizedXPointer(string.format("/body/DocFragment[%d].0", spine + 1))
        else
            local id = target and target:sub(2) or "lexeme_loc_" .. label
            found = document:getNormalizedXPointer(string.format("#_doc_fragment_%d_ %s", spine, id))
        end
        found = found ~= "" and found or false
        index.marks[label] = found
    end
    return found or nil
end

-- The last location marked at or before xpointer in the text, and its mark; nil before the first.
local function markBefore(document, index, xpointer)
    local fragment = tonumber(xpointer:match("^/body/DocFragment%[(%d+)%]"))
    if not fragment then return nil end
    local spine = fragment - 1
    local row = lastFitting(#index.spines, function(i) return index.spines[i] <= spine end)
    while row > 0 do
        local row_spine = index.spines[row]
        local labels = labelsIn(index, row_spine)
        local found = #labels
        if row_spine == spine then
            found = lastFitting(#labels, function(i)
                local at = mark(document, index, row_spine, labels[i])
                local order = at and document:compareXPointers(at, xpointer)
                return order == 1 or order == 0
            end)
        end
        -- Marks crengine can't find are passed over, back to the last one it can.
        for i = found, 1, -1 do
            local at = mark(document, index, row_spine, labels[i])
            if at then return labels[i], at end
        end
        row = row - 1
    end
end

-- What lexeme_kindle_locations.txt says, kept as its text and read as asked.
local function readMarksFile(file)
    local text = readFile(besideSettings(file, MARKS_FILE))
    if not text or not text:match("^lexeme%-kindle%-locations 1\n") then return nil end
    return { count = tonumber(text:match("\ncount (%d+)")),
        moved = " " .. (text:match("\nmoved ([^\n]*)") or "") .. " ",
        text = text }
end

local function movedBy(extra, label)
    return tonumber(extra.moved:match(" " .. label .. ":(%d+) ")) or 0
end

-- Where the locations after label's start, as offsets from its mark; nil if none.
local function offsetsAfter(extra, label)
    local at = extra.text:find("\nafter " .. label .. " ", 1, true)
    if not at then return nil end
    local offsets = {}
    for offset in extra.text:match("^[^\n]*", at + 1):gmatch(" (%d+)") do offsets[#offsets + 1] = tonumber(offset) end
    table.remove(offsets, 1) -- the label itself
    return offsets
end

-- The location xpointer is in, from the book's marks.
local function markedLocationAt(entry, document, xpointer)
    local label, at = markBefore(document, entry.index, xpointer)
    if not label then return 1 end
    local location, extra = entry.locationOf(label), entry.extra
    local moved = extra and movedBy(extra, label) or 0
    local offsets = extra and offsetsAfter(extra, label)
    if moved == 0 and not offsets then return location end
    local chars = 0
    if document:compareXPointers(at, xpointer) == 1 then
        chars = Kfx.length(document:getTextFromXPointers(at, xpointer) or "")
    end
    if chars < moved then return math.max(1, location - 1) end
    for _, offset in ipairs(offsets or {}) do
        if offset > chars then break end
        location = location + 1
    end
    return location
end

local function markedBook(document, index)
    local extra = readMarksFile(document.file)
    local labels = index.total
    local count = extra and extra.count or labels
    return {
        index = index, extra = extra, total = count, known = {},
        -- A long book marks every few locations: label N is location (N - 1) * count // labels + 1.
        locationOf = function(n)
            if count == labels then return n end
            return math.floor((n - 1) * count / labels) + 1
        end,
    }
end

-- The mark of the last location marked at or before `location`.
local function markOfLocation(entry, document, location)
    local index = entry.index
    local label = math.max(1, math.min(index.total, entry.total == index.total and location
        or math.floor((location - 1) * index.total / entry.total) + 1))
    while label > 1 and entry.locationOf(label) > location do label = label - 1 end
    local row = lastFitting(#index.spines, function(i) return index.first[index.spines[i]] <= label end)
    while row > 0 do
        local spine = index.spines[row]
        local labels = labelsIn(index, spine)
        for i = #labels, 1, -1 do
            local at = labels[i] <= label and mark(document, index, spine, labels[i])
            if at then return at end
        end
        row = row - 1
    end
end

-- Measures ----------------------------------------------------------------------------

-- Amazon's map from its copy of the book, kept beside the book's settings with the copy's size and
-- time, so the copy is read once.
local function amazonStarts(file, copy)
    local attributes = lfs.attributes(copy) or {}
    local stamp = tostring(attributes.size) .. " " .. tostring(attributes.modification)
    local path = besideSettings(file, MAP_FILE)
    local saved = readFile(path)
    if saved and saved:match("^lexeme%-amazon%-location%-map 1\n") and saved:match("\ncopy ([^\n]*)") == stamp then
        local starts, at = {}, 0
        for step in (saved:match("\nstarts ([^\n]*)") or ""):gmatch("%d+") do
            at = at + tonumber(step)
            starts[#starts + 1] = at
        end
        if #starts > 0 then return starts end
    end
    local starts = Kfx.locationStarts(copy)
    if starts and lfs.attributes(DocSettings:getSidecarDir(file), "mode") == "directory" then
        local steps, previous = {}, 0
        for i, start in ipairs(starts) do
            steps[i] = start - previous
            previous = start
        end
        writeFile(path,
            "lexeme-amazon-location-map 1\ncopy " .. stamp .. "\nstarts " .. table.concat(steps, " ") .. "\n")
    end
    return starts
end

local function book(ui)
    local document = ui.document
    if books[document] then return books[document] end
    local index = readIndex(document)
    if index then
        books[document] = markedBook(document, index)
        return books[document]
    end
    local copy = amazonCopy(document.file)
    local starts = copy and amazonStarts(document.file, copy)
    local kind = starts and "kfx" or "html"
    local entry = { starts = starts, measure = starts and Kfx.length or htmlBytes, known = {}, kind = kind,
        size = tostring(lfs.attributes(document.file, "size")), places = {} }
    -- What was measured before in this book, if it's still the same file.
    local saved = ui.doc_settings and ui.doc_settings:readSetting("lexeme_location_places")
    if type(saved) == "table" and saved.size == entry.size and saved.kind == kind then
        entry.places, entry.bytes = saved.places or {}, saved.bytes
    end
    if starts then
        entry.total = #starts
    else
        if not entry.bytes then
            local last = document:getPageXPointer(document:getPageCount())
            entry.bytes = htmlBytes(document:getTextFromXPointers(document:getPageXPointer(1), last) or "")
            entry.places_changed = true
        end
        local bytes = entry.bytes
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

-- Keeps `measured` as the measure up to xpointer, unless a place kept is that close already.
local function keepPlace(entry, xpointer, measured)
    local places = entry.places
    for _, place in ipairs(places) do
        if math.abs(place[2] - measured) < PLACE_SPACING then return end
    end
    table.insert(places, { xpointer, measured })
    table.sort(places, function(a, b) return a[2] < b[2] end)
    -- Too many: the one closest to its neighbours goes.
    if #places > MAX_PLACES then
        local closest, gap = 2, math.huge
        for i = 2, #places - 1 do
            if places[i + 1][2] - places[i - 1][2] < gap then closest, gap = i, places[i + 1][2] - places[i - 1][2] end
        end
        table.remove(places, closest)
    end
    entry.places_changed = true
end

-- How much text comes before xpointer, measured on from the nearest place measured before it, so
-- a page turn reads one page and a jump no more than from the nearest place kept.
local function measureBefore(entry, document, xpointer)
    local from, measured = document:getPageXPointer(1), 0
    local candidates = { entry.measured_at and { entry.measured_at, entry.measured } or nil }
    for _, place in ipairs(entry.places) do candidates[#candidates + 1] = place end
    for _, place in ipairs(candidates) do
        if place[2] >= measured then
            local order = document:compareXPointers(place[1], xpointer)
            if order == 1 or order == 0 then from, measured = place[1], place[2] end
        end
    end
    if document:compareXPointers(from, xpointer) == 1 then
        local step = entry.measure(document:getTextFromXPointers(from, xpointer) or "")
        measured = measured + step
        if step >= PLACE_SPACING then keepPlace(entry, xpointer, measured) end
    end
    entry.measured_at, entry.measured = xpointer, measured
    return measured
end

local function measuredLocationAt(entry, document, xpointer)
    local measured = measureBefore(entry, document, xpointer)
    if not entry.starts then return math.floor(measured / BYTES_PER_LOCATION) + 1 end
    return math.max(1, lastFitting(#entry.starts, function(i) return entry.starts[i] <= measured end))
end

-- Kept per place: the toolbar asks for the page's and for "Back to"'s at each paint.
local function locationOf(entry, document, xpointer)
    if entry.known[xpointer] then return entry.known[xpointer] end
    local location = entry.index and markedLocationAt(entry, document, xpointer)
        or measuredLocationAt(entry, document, xpointer)
    entry.known[xpointer] = location
    return location
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

-- The location at a place in the book (an xpointer); nil for books laid out in fixed pages.
function Locations.at(ui, xpointer)
    if not ui.rolling or type(xpointer) ~= "string" then return end
    return locationOf(book(ui), ui.document, xpointer)
end

-- A highlight's or bookmark's location, as recorded or worked out now.
function Locations.ofAnnotation(ui, item)
    if item.lexeme_location then return item.lexeme_location end
    return Locations.at(ui, annotationXPointer(item))
end

-- Turns to the page `location` starts on.
function Locations.goTo(ui, location)
    if not ui.rolling then return end
    local entry, document = book(ui), ui.document
    local pages = document:getPageCount()
    location = math.max(1, math.min(location, entry.total or location))
    local page
    if entry.index then
        -- The page of its mark, or in a long book that marks every few locations, one a little after.
        local at = markOfLocation(entry, document, location)
        page = at and document:getPageFromXPointer(at) or 1
        while page < pages and locationOf(entry, document, document:getPageXPointer(page + 1)) < location do
            page = page + 1
        end
    else
        -- The last page that starts no later than the location.
        local start = entry.starts and entry.starts[location] or (location - 1) * BYTES_PER_LOCATION
        page = math.max(1, lastFitting(pages, function(p)
            return measureBefore(entry, document, document:getPageXPointer(p)) <= start
        end))
    end
    ui:handleEvent(Event:new("GotoPage", page))
end

-- Where Amazon's reader left a MOBI book: a byte offset into its HTML, the first number of "lpr" in
-- the book's .sdr/*.mbs, or *.azw3f for an AZW3 (KRDS files: typed values, a field named after 0xFE).
local function amazonOffset(file)
    local sdr = file:gsub("%.[^.]+$", "") .. ".sdr"
    if lfs.attributes(sdr, "mode") ~= "directory" then return nil end
    for name in lfs.dir(sdr) do
        local f = (name:match("%.mbs$") or name:match("%.azw3f$")) and io.open(sdr .. "/" .. name, "rb")
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

--[[
Where each page read starts and where the next one does, in locations, by the page count of the
layout it was read in. A page turned to is noted in the book's settings as two xpointers until the
book's locations are next worked out; then its locations are added to a file beside the settings, a
line each: the layout, the page, the two locations, tab-separated. Kept in the settings, they grew
with every page read, and KOReader rewrites the settings whole at every close, sleep and periodic save.
]]
local PAGE_XPOINTERS, PAGE_LOCATIONS = "lexeme_page_xpointers", "lexeme_page_locations"
local PAGES_FILE = "lexeme_page_locations.tsv"
-- An open book's pages located, by document, once its file has been read.
local pages_located = setmetatable({}, { __mode = "k" })

local function readPagesFile(file, into)
    into = into or {}
    local f = io.open(besideSettings(file, PAGES_FILE), "rb")
    if not f then return into end
    for line in f:lines() do
        local layout, page, start, stop = line:match("^(%d+)\t(%d+)\t(%d+)\t(%d+)")
        if layout then
            into[layout] = into[layout] or {}
            into[layout][tonumber(page)] = { tonumber(start), tonumber(stop) }
        end
    end
    f:close()
    return into
end

local function appendFile(path, data)
    local f = io.open(path, "ab")
    return f and f:write(data) and f:close() or false
end

-- Notes where a page turned to starts; it becomes locations when the book's locations are next worked out.
function Locations.notePage(ui, page)
    if not ui.rolling or not ui.document or not ui.doc_settings then return end
    local document, settings = ui.document, ui.doc_settings
    local count = document:getPageCount()
    local layout = tostring(count)
    local located = pages_located[document]
    if located and located[layout] and located[layout][page] then return end
    local noted = settings:readSetting(PAGE_XPOINTERS) or {}
    noted[layout] = noted[layout] or {}
    if noted[layout][page] then return end
    local next_page = page < count and document:getPageXPointer(page + 1) or false
    noted[layout][page] = { document:getPageXPointer(page), next_page }
    settings:saveSetting(PAGE_XPOINTERS, noted)
end

-- The places a book's settings still need located: its highlights and bookmarks, and the pages
-- noted that `located` (pages located, by layout) doesn't have.
local function unlocated(settings, annotations, located)
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
    for layout, pages in pairs(settings:readSetting(PAGE_XPOINTERS) or {}) do
        for page, xpointers_of in pairs(pages) do
            if not (located and located[layout] and located[layout][page]) then
                add(xpointers_of[1])
                add(xpointers_of[2] or nil)
            end
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

-- Saves what `found` says about the places of the book at `file`, with its location count (false
-- when it couldn't be measured). `located` is what its pages file has, read here when not given.
local function saveLocated(file, settings, annotations, found, total, located)
    for _, item in ipairs(annotations) do
        local location = found[annotationXPointer(item) or ""]
        if not item.lexeme_location and location then item.lexeme_location = location end
    end
    located = located or readPagesFile(file)
    local lines = {}
    local function add(layout, page, start, stop)
        local known = located[layout] and located[layout][page]
        if known and known[1] == start and known[2] == stop then return end
        located[layout] = located[layout] or {}
        located[layout][page] = { start, stop }
        lines[#lines + 1] = string.format("%s\t%d\t%d\t%d\n", layout, page, start, stop)
    end
    -- Pages located before the file existed, kept in the settings, move out to it.
    for layout, pages in pairs(settings:readSetting(PAGE_LOCATIONS) or {}) do
        for page, range in pairs(type(pages) == "table" and pages or {}) do
            local start = type(range) == "table" and tonumber(range[1])
            local stop = type(range) == "table" and tonumber(range[2])
            if tonumber(layout) and tonumber(page) and start and stop then
                add(tostring(layout), tonumber(page), start, stop)
            end
        end
    end
    for layout, pages in pairs(settings:readSetting(PAGE_XPOINTERS) or {}) do
        for page, xpointers in pairs(pages) do
            local start = found[xpointers[1]]
            local stop = xpointers[2] and found[xpointers[2]] or (total and total + 1)
            if start and stop then add(layout, page, start, math.max(stop, start + 1)) end
        end
    end
    -- Without the file (the book's settings folder isn't made yet), the pages wait in the settings.
    if #lines == 0 or appendFile(besideSettings(file, PAGES_FILE), table.concat(lines)) then
        settings:delSetting(PAGE_LOCATIONS)
        settings:delSetting(PAGE_XPOINTERS)
    end
    settings:saveSetting("lexeme_locations", total or false)
end

--[[
Keeps the open book's location count, and the locations of its highlights,
bookmarks and the pages read, with the book's settings, for Lexeme. Only what's
missing is worked out, so this costs little once done.
]]
function Locations.record(ui)
    if not ui.rolling or not ui.annotation or not ui.document then return end
    local settings, document = ui.doc_settings, ui.document
    local annotations = ui.annotation.annotations or {}
    local located = pages_located[document]
    if not located then
        located = readPagesFile(document.file)
        pages_located[document] = located
    end
    local xpointers = unlocated(settings, annotations, located)
    local entry = book(ui)
    if #xpointers > 0 or settings:readSetting("lexeme_locations") ~= entry.total
            or settings:readSetting(PAGE_XPOINTERS) or settings:readSetting(PAGE_LOCATIONS) then
        saveLocated(document.file, settings, annotations, locate(entry, document, xpointers), entry.total, located)
    end
    if entry.places_changed then
        entry.places_changed = nil
        settings:saveSetting("lexeme_location_places", { size = entry.size, kind = entry.kind, bytes = entry.bytes,
            places = entry.places })
    end
end

-- A book bigger than this isn't opened in the background: it would take more memory than a Kindle
-- has beside the book being read. It's measured when it's next opened.
local MAX_BACKGROUND_BYTES = 8 * 1024 * 1024

-- Opens a book without showing it and works out its location count and where each of `xpointers` falls.
local function measureClosedBook(file, xpointers)
    local document = require("document/documentregistry"):openDocument(file)
    if not document then return end
    local ok, total, found = pcall(function()
        document:loadDocument()
        -- A book with location marks is measured in its text, which loading reads: it isn't laid out.
        local index = readIndex(document)
        if not index then document:render() end
        local entry = index and markedBook(document, index) or book({ document = document })
        return entry.total, locate(entry, document, xpointers)
    end)
    -- The document isn't closed, which would save its layout to crengine's cache: this process ends here.
    if ok then return total, found end
end

--[[
Does for every book that isn't open what Locations.record does for the open
one, so Lexeme gets locations without the book being opened. A book takes
seconds to measure, so each is measured in a child process, never on the
screen's thread; this runs inside a background task. A book that can't be
measured is marked and left alone. A book whose marks file has its count needs
opening only for the places it has to locate.
]]
function Locations.recordClosedBooks(open_file)
    local Background = require("lexeme/background")
    local DocumentRegistry = require("document/documentregistry")
    for _, history in ipairs(require("readhistory").hist) do
        local file = history.file
        local size = file and file ~= open_file and lfs.attributes(file, "mode") == "file"
            and lfs.attributes(file, "size")
        local provider = size and DocSettings:hasSidecarFile(file) and DocumentRegistry:getProvider(file)
        if provider and provider.provider == "crengine" then
            local settings = DocSettings:open(file)
            local xpointers = unlocated(settings, settings:readSetting("annotations") or {})
            local extra = readMarksFile(file)
            local saved = settings:readSetting("lexeme_locations")
            -- Counted, or found not to be countable (false).
            local settled = saved == false or (type(saved) == "number" and (not extra or saved == extra.count))
            if #xpointers == 0 and not settled and extra and extra.count then
                settings:saveSetting("lexeme_locations", extra.count)
                settings:flush()
            elseif (#xpointers > 0 or not settled) and size <= MAX_BACKGROUND_BYTES then
                local ok, total, found = pcall(Background.await, function()
                    return measureClosedBook(file, xpointers)
                end, nil, true)
                -- No child process to measure in: left for another time.
                local deferred = not ok and (total == "Not in a background task." or total == "No background process.")
                if not deferred then
                    -- Read again: the book may have been opened and changed meanwhile.
                    settings = DocSettings:open(file)
                    local annotations = settings:readSetting("annotations") or {}
                    saveLocated(file, settings, annotations, ok and found or {}, ok and total or nil)
                    settings:saveSetting("annotations", annotations)
                    settings:flush()
                end
            end
        end
    end
end

-- Where a page read lies in locations: as located while reading, or else in proportion to the
-- page's place in the book. `known` is { file =, total = location count, pages = pages located by an
-- earlier version, from its settings }; its pages file is read the first time it's needed.
function Locations.ofPageRead(known, page, total_pages)
    if known.file and not known.pages_read then
        known.pages_read = true
        known.pages = readPagesFile(known.file, type(known.pages) == "table" and known.pages or nil)
    end
    local layout = known.pages and known.pages[tostring(total_pages)]
    local exact = layout and layout[page]
    if exact then return exact[1], exact[2] end
    local total = known.total
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

-- Print pages ------------------------------------------------------------------------------
-- A converted book's print pages are kept beside its settings rather than in them: KOReader
-- rewrites the settings whole at every close, sleep and periodic save (4 s for Woolf's 16,000 print
-- pages), and Home reads them for every book in the history.

local function printFile(ui)
    return besideSettings(ui.document.file, PRINT_FILE)
end

-- Books converted before the file existed have their print pages in their settings: they move out.
function Locations.setup(ui)
    if not (ui.rolling and ui.doc_settings) then return end
    local settings = ui.doc_settings
    local pages = settings:readSetting("lexeme_print_page_map")
    if type(pages) ~= "table" then return end
    local lines = {}
    for i, page in ipairs(pages) do
        lines[i] = tostring(page.label):gsub("[\t\n]", " ") .. "\t" .. tostring(page.target) .. "\n"
    end
    if not writeFile(printFile(ui), table.concat(lines)) then
        logger.warn("Lexeme: couldn't write", printFile(ui))
        return
    end
    settings:delSetting("lexeme_print_page_map")
end

-- The book's print pages as { label, target } in order, read once; nil without any.
local function printPages(ui, entry)
    if entry.print_pages == nil then
        local pages = {}
        local file = io.open(printFile(ui), "rb")
        if file then
            for line in file:lines() do
                local label, target = line:match("^([^\t]*)\t(.+)$")
                if label then pages[#pages + 1] = { label = label, target = target } end
            end
            file:close()
        end
        entry.print_pages = #pages > 0 and pages or false
    end
    return entry.print_pages or ui.doc_settings:readSetting("lexeme_print_page_map")
end

-- Whether the book has location marks: a converted book, whose print pages (if it has any) stand
-- for its pages, rather than KOReader's.
-- Asked at every paint of the page number: a book without marks isn't measured for it.
local unmarked = setmetatable({}, { __mode = "k" })

function Locations.replacesPages(ui)
    local document = ui.document
    if not (ui.rolling and document) or unmarked[document] then return false end
    if not books[document] and not readIndex(document) then
        unmarked[document] = true
        return false
    end
    return book(ui).index ~= nil
end

-- The print edition's page at the current page, from a converted book's print pages, and the last
-- one; nil without any. A binary search places only the few it compares.
function Locations.printPage(ui)
    local document = ui.document
    if not (ui.rolling and document and ui.doc_settings) then return nil end
    local entry = book(ui)
    local map = printPages(ui, entry)
    if type(map) ~= "table" or #map == 0 then return nil end
    local page, layout = document:getCurrentPage(), document:getPageCount()
    if not (entry.print and entry.print.layout == layout) then
        entry.print = { layout = layout, starts = {}, labels = {} }
    end
    local cache = entry.print
    if cache.labels[page] == nil then
        local found = lastFitting(#map, function(i)
            local start = cache.starts[i]
            if start == nil then
                local xpointer = document:getNormalizedXPointer(map[i].target)
                start = xpointer and xpointer ~= "" and document:getPageFromXPointer(xpointer) or math.huge
                cache.starts[i] = start
            end
            return start <= page
        end)
        cache.labels[page] = found > 0 and map[found].label or false
    end
    return cache.labels[page] or nil, map[#map].label
end

return Locations
