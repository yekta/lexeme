--[[
Kindle locations for the book being read, as the footer, the toolbar, Go To and the notebook show
them. They're KOReader's page labels, set up when a book opens:

- A book converted from a Kindle document carries the Kindle's own location map as its page list
  (its sidecar says lexeme_locations = "kindle"). Exact.
- A MOBI book (.mobi, .azw, .azw3, .prc): the Kindle counts a location per 150 bytes of the
  book's text, so the count comes from the file's header, and a synthetic page map spreads that
  many locations over the text.
- Any other reflowable book without its own page list: a location per 110 characters, starting
  over at each of the book's files, as the Kindle numbers the books it converts itself.

A book with its own (print) page list keeps it, and has no locations.
]]
local Event = require("ui/event")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local Locations = {}

local CHARS_PER_LOCATION = 110
local MOBI_BYTES_PER_LOCATION = 150
local MOBI_CHARS_PER_LABEL = 100

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

-- Builds a synthetic page map, if the book hasn't got that one, and returns its last label.
-- Where the Kindle's own reader left a MOBI book: a byte offset in the text, the first number of
-- "lpr" in the book's .sdr/*.mbs (a KRDS file: typed values, a field named after 0xFE).
function Locations.amazonOffset(file)
    local sdr = file:gsub("%.[^.]+$", "") .. ".sdr"
    if lfs.attributes(sdr, "mode") ~= "directory" then return nil end
    for entry in lfs.dir(sdr) do
        if entry:match("%.mbs$") then
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

local function synthetic(ui, chars)
    local pagemap = ui.pagemap
    if not pagemap.has_pagemap then
        pagemap.has_pagemap = true
        pagemap:resetLayout()
        pagemap.view:registerViewModule("pagemap", pagemap)
    end
    pagemap.chars_per_synthetic_page = chars
    pagemap.page_labels_cache = nil
    ui.document:buildSyntheticPageMap(chars)
    pagemap:updateVisibleLabels()
    ui.doc_settings:saveSetting("pagemap_chars_per_synthetic_page", chars)
    return tonumber(pagemap:getLastPageLabel(true)) or 0
end

-- Records how the book's page labels become locations: `count` locations over `labels` labels.
-- KOReader shows the labels as page numbers only when they are the locations.
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

local function isMobi(file)
    local ext = (file or ""):lower():match("%.(%w+)$")
    return ext == "mobi" or ext == "azw" or ext == "azw3" or ext == "prc"
end

-- Gives the book its locations the first time it's opened. Later opens keep them: KOReader
-- rebuilds a synthetic page map from the book's settings, or crengine has it cached.
function Locations.setup(ui)
    if not (ui.rolling and ui.pagemap and ui.doc_settings) then return end
    local settings = ui.doc_settings
    local kind = settings:readSetting("lexeme_locations")
    if kind then
        -- Books set up before the count was kept get it now, without rebuilding anything.
        if not settings:readSetting("lexeme_location_count") and ui.pagemap.has_pagemap then
            local labels = tonumber(ui.pagemap:getLastPageLabel(true)) or 0
            local count = kind == "mobi" and Locations.mobiCount(ui.document.file) or labels
            if labels > 0 and count then record(ui, kind, count, labels) end
        end
        return
    end
    if ui.pagemap.has_pagemap_document_provided then return end
    if isMobi(ui.document.file) then
        local count = Locations.mobiCount(ui.document.file)
        if count and count > 0 then
            -- One build, finer than the locations; its labels are scaled to the Kindle's count.
            local labels = synthetic(ui, MOBI_CHARS_PER_LABEL)
            if labels > 0 then
                record(ui, "mobi", count, labels)
                logger.info("Lexeme: Kindle locations:", count, "over", labels, "labels")
                -- A book KOReader opens for the first time starts where the Kindle's reader left it.
                local offset = ui.document.is_new and Locations.amazonOffset(ui.document.file)
                if offset and offset > 0 then
                    local location = math.min(count, math.floor(offset / MOBI_BYTES_PER_LOCATION) + 1)
                    UIManager:nextTick(function()
                        if ui.document then Locations.goTo(ui, location) end
                    end)
                    logger.info("Lexeme: opening at the Kindle reader's location", location)
                end
                return
            end
        end
    end
    local labels = synthetic(ui, CHARS_PER_LOCATION)
    if labels > 0 then record(ui, "estimated", labels, labels) end
end

function Locations.available(ui)
    return ui.rolling and ui.pagemap and ui.pagemap.has_pagemap and ui.doc_settings
        and ui.doc_settings:readSetting("lexeme_locations") ~= nil
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

local function labelToLocation(ui, label)
    local count, labels = scale(ui)
    if not label then return nil end
    if count == labels then return label end
    return math.min(count, math.floor((label - 1) * count / labels) + 1)
end

-- The location at the top of the page, and the book's last location.
function Locations.current(ui)
    if not Locations.available(ui) then return nil end
    local label = tonumber(ui.pagemap:getXPointerPageLabel(ui.document:getXPointer(), true)) or 1
    return labelToLocation(ui, label), (scale(ui))
end

-- The location of a position in the book (an xpointer).
function Locations.at(ui, xp)
    if not Locations.available(ui) then return nil end
    return labelToLocation(ui, tonumber(ui.pagemap:getXPointerPageLabel(xp, true)))
end

function Locations.goTo(ui, location)
    local count, labels = scale(ui)
    local label = count == labels and location or math.floor((location - 1) * labels / count) + 1
    local _, page = ui.pagemap:getPageLabelProps(tostring(label))
    if page then ui:handleEvent(Event:new("GotoPage", page)) end
end

-- Whether the page list is the Kindle's locations rather than the print edition's pages.
function Locations.replacesPages(ui)
    return Locations.available(ui)
end

-- The print edition's page at the current page, from a converted book's lexeme_print_page_map
-- (label and position of each print page), or nil.
function Locations.printPage(ui)
    local map = ui.doc_settings and ui.doc_settings:readSetting("lexeme_print_page_map")
    if type(map) ~= "table" or #map == 0 then return nil end
    local document = ui.document
    local cache = Locations.print_cache
    local pages = document:getPageCount()
    if not cache or cache.document ~= document or cache.pages ~= pages then
        cache = { document = document, pages = pages, starts = {} }
        for i, entry in ipairs(map) do
            local xp = document:getNormalizedXPointer(entry.target)
            cache.starts[i] = xp and document:getPageFromXPointer(xp) or math.huge
        end
        Locations.print_cache = cache
    end
    local page = document:getCurrentPage()
    local label
    for i, start in ipairs(cache.starts) do
        if start <= page then label = map[i].label end
    end
    return label, map[#map].label
end

return Locations
