--[[
What Amazon's reader kept on this Kindle, queued for Lexeme: books with their
progress (cc.db), words looked up (vocab.db) and highlights and notes (My
Clippings.txt). A book that was converted for KOReader takes that copy's key,
so its Amazon history and KOReader reading land on the same book.
]]
local DocSettings = require("docsettings")
local JSON = require("json")
local lfs = require("libs/libkoreader-lfs")
local utf8proc = require("ffi/utf8proc")

local Books = require("lexeme/books")
local Reading = require("lexeme/reading")

local Import = {}

local CC_DB = "/var/local/cc.db"
local VOCAB_DB = "/mnt/us/system/vocabulary/vocab.db"

local function rows(path, sql)
    if lfs.attributes(path, "mode") ~= "file" then return {} end
    local SQ3 = require("lua-ljsqlite3/init")
    local conn = SQ3.open(path, "ro")
    local ok, columns = pcall(conn.exec, conn, sql)
    conn:close()
    local result = {}
    if not ok or not columns then return result end
    for i = 1, #columns[1] do
        local row = {}
        for c = 1, #columns do row[c] = columns[c][i] end
        table.insert(result, row)
    end
    return result
end

-- The file name the KOReader copy of an Amazon book was given. Amazon keeps titles in decomposed Unicode.
local function convertedPath(title)
    local ok, composed = pcall(utf8proc.normalize_NFC, title)
    title = ok and composed or title
    local name = title:gsub('[\\/:*?"<>|]+', ""):gsub("^%s+", ""):gsub("[%s%.]+$", ""):sub(1, 150)
    local path = Books.homeDir() .. "/Books/" .. name .. ".epub"
    if lfs.attributes(path, "mode") == "file" then return path end
end

local function authorsOf(credits)
    local ok, list = pcall(JSON.decode, credits or "")
    if not ok or type(list) ~= "table" then return nil end
    local names = {}
    for _, credit in ipairs(list) do
        local name = type(credit.name) == "table" and credit.name.display
        if name then table.insert(names, name) end
    end
    return #names > 0 and table.concat(names, ", ") or nil
end

-- Amazon books by cde key, each with the book key Lexeme will know it by.
local function amazonBooks()
    local books = {}
    for _, row in ipairs(rows(CC_DB, [[
        SELECT p_cdeKey, p_titles_0_nominal, j_credits, p_percentFinished, p_lastAccess, p_readState
        FROM Entries WHERE p_cdeType IN ('EBOK', 'PDOC') AND p_cdeKey IS NOT NULL
          AND p_titles_0_nominal IS NOT NULL;]])) do
        local cde, title = row[1], row[2]
        local percent = tonumber(row[4])
        local opened = (tonumber(row[5]) or 0) > 0 and (percent or 0) > 0
        if not books[cde] or opened then
            local path = convertedPath(title)
            -- The key KOReader keeps for the copy, as syncing sends it; the file's checksum can since differ.
            local settings = path and DocSettings:hasSidecarFile(path) and DocSettings:open(path) or nil
            local key = path and Reading.bookKey(path, settings) or "kindle:" .. cde
            local finished = tonumber(row[6]) == 2 or (percent or 0) >= 100
            local last_read = (tonumber(row[5]) or 0) * 1000
            books[cde] = {
                id = Reading.stableId("book:" .. key),
                key = key,
                title = title,
                authors = authorsOf(row[3]),
                progress = percent and math.min(1, percent / 100) or nil,
                status = finished and "finished" or "reading",
                last_read_at = last_read > 0 and last_read or nil,
                finished_at = finished and last_read > 0 and last_read or nil,
                opened = opened,
            }
        end
    end
    return books
end

local function lookups(books, used)
    local result = {}
    for _, row in ipairs(rows(VOCAB_DB, [[
        SELECT l.id, w.word, l.usage, l.timestamp, b.asin, w.stem
        FROM LOOKUPS l JOIN WORDS w ON w.id = l.word_key LEFT JOIN BOOK_INFO b ON b.id = l.book_key;]])) do
        local book = row[5] and books[row[5]]
        if book then used[row[5]] = true end
        local context = row[3] and row[3]:gsub("^%s+", ""):gsub("%s+$", "") or nil
        table.insert(result, {
            id = Reading.stableId("kindle-lookup:" .. row[1]),
            book_key = book and book.key or nil,
            word = row[2],
            headword = row[6] ~= "" and row[6] or nil,
            context = context ~= "" and context or nil,
            looked_up_at = tonumber(row[4]) or 0,
        })
    end
    return result
end

local MONTHS = {
    january = 1, february = 2, march = 3, april = 4, may = 5, june = 6, july = 7, august = 8,
    september = 9, october = 10, november = 11, december = 12,
}

-- "Added on Tuesday, January 13, 2026 3:39:42 AM" or "Added on Monday, 10 November 2026 14:03:22".
local function addedAt(line)
    local month, day, year = line:match("(%a+) (%d+), (%d%d%d%d)")
    if not month then day, month, year = line:match("(%d+) (%a+) (%d%d%d%d)") end
    local h, mi, s = line:match("(%d+):(%d+):(%d+)")
    if not (month and MONTHS[month:lower()] and h) then return 0 end
    h = tonumber(h)
    local meridiem = line:match("%d+:%d+:%d+ ([AP]M)")
    if meridiem == "PM" and h < 12 then h = h + 12 end
    if meridiem == "AM" and h == 12 then h = 0 end
    return os.time{ year = year, month = MONTHS[month:lower()], day = day, hour = h, min = mi, sec = s } * 1000
end

-- "Title (Author)" → cde key of the matching Amazon book.
local function bookByHeading(books, heading)
    for cde, book in pairs(books) do
        if heading == book.title or heading:sub(1, #book.title + 1) == book.title .. " " then return cde end
    end
end

local function clippings(books, used)
    local file = io.open(Books.homeDir() .. "/My Clippings.txt", "r")
    if not file then return {} end
    local text = file:read("*a"):gsub("\239\187\191", ""):gsub("\r", "")
    file:close()
    local highlights, notes, order = {}, {}, {}
    for entry in (text .. "\n=========="):gmatch("(.-)\n==========") do
        local heading, meta, body = entry:match("^%s*([^\n]+)\n([^\n]+)\n%s*\n?(.*)$")
        local cde = heading and bookByHeading(books, heading)
        body = body and body:gsub("^%s+", ""):gsub("%s+$", "")
        if cde and body and body ~= "" then
            local page = meta:match("page (%S+)")
            local location = tonumber(meta:match("Location (%d+)")) or 0
            local at = addedAt(meta)
            if meta:find("Your Highlight") then
                -- Extending a highlight adds a new clipping at the same place; the last one wins.
                local slot = cde .. ":" .. location
                if not highlights[slot] then table.insert(order, slot) end
                highlights[slot] = { cde = cde, text = body, page = page, at = at, location = location }
            elseif meta:find("Your Note") then
                table.insert(notes, { cde = cde, text = body, location = location })
            end
        end
    end
    for _, note in ipairs(notes) do
        local best
        for _, slot in ipairs(order) do
            local h = highlights[slot]
            if h.cde == note.cde and h.location <= note.location and (not best or h.location > best.location) then
                best = h
            end
        end
        if best then best.note = note.text end
    end
    local result = {}
    for _, slot in ipairs(order) do
        local h = highlights[slot]
        used[h.cde] = true
        local key = books[h.cde].key
        table.insert(result, {
            id = Reading.stableId("kindle-highlight:" .. key .. ":" .. h.location .. ":" .. h.text),
            book_key = key,
            text = h.text,
            note = h.note,
            page = h.page,
            location = h.location > 0 and h.location or nil,
            highlighted_at = h.at,
        })
    end
    return result
end

-- Bumped when the import starts sending something new; an earlier import is then run again once.
Import.VERSION = 2

-- Queues everything; returns the counts.
function Import.queue()
    local Sync = require("lexeme/sync")
    local books = amazonBooks()
    local used = {}
    local words = lookups(books, used)
    local highlights = Sync.sendsHighlights() and clippings(books, used) or {}
    local book_rows = {}
    for cde, book in pairs(books) do
        if book.opened or used[cde] then
            book.opened = nil
            table.insert(book_rows, book)
        end
    end
    Sync.queueReading{ books = book_rows, highlights = highlights, lookups = words }
    G_reader_settings:saveSetting("lexeme_kindle_imported_at", os.time())
    G_reader_settings:saveSetting("lexeme_kindle_import_version", Import.VERSION)
    return { books = #book_rows, highlights = #highlights, lookups = #words }
end

--[[
Sends the highlights an earlier import sent without their Amazon locations once
more, with them; the ids are the same, so Lexeme's copies are updated. Only for
books Lexeme already has from this Kindle, and only highlights: what Amazon
says of the books themselves, like how far they were read, isn't sent again.
]]
function Import.catchUp()
    if G_reader_settings:readSetting("lexeme_kindle_import_version") == Import.VERSION then return end
    local synced = {}
    for _, book in ipairs((Reading.books())) do synced[book.key] = true end
    local highlights = {}
    for _, highlight in ipairs(clippings(amazonBooks(), {})) do
        if synced[highlight.book_key] then table.insert(highlights, highlight) end
    end
    require("lexeme/sync").queueReading{ highlights = highlights }
    G_reader_settings:saveSetting("lexeme_kindle_import_version", Import.VERSION)
end

return Import
