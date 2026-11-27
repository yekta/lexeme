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

--[[
Keeps the open book's location count, and the location of each of its highlights
and bookmarks, with the book's settings, for Lexeme. Only what's missing is
worked out, in reading order, so this costs nothing once done.
]]
function Locations.record(ui)
    if not ui.rolling or not ui.annotation then return end
    local missing = {}
    for _, item in ipairs(ui.annotation.annotations or {}) do
        local xpointer = item.pos0 or item.page
        if not item.lexeme_location and type(xpointer) == "string" then table.insert(missing, item) end
    end
    if #missing == 0 and ui.doc_settings:has("lexeme_locations") then return end
    local entry = book(ui)
    ui.doc_settings:saveSetting("lexeme_locations", entry.total)
    for _, item in ipairs(missing) do
        item.lexeme_location = locationOf(entry, ui.document, item.pos0 or item.page)
    end
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
