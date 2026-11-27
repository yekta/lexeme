--[[
Everything KOReader records about the reading on this device, shaped for the
server's sync-reading: books from the history and their settings, every page
visit from the statistics database, highlights, notes and bookmarks from each
book, and words from the dictionary's history and Vocabulary Builder. Ids are
derived from stable keys, so the same record always produces the same id.
]]
local DataStorage = require("datastorage")
local DocSettings = require("docsettings")
local ReadHistory = require("readhistory")
local Books = require("lexeme/books")
local Headwords = require("lexeme/headwords")
local lfs = require("libs/libkoreader-lfs")
local md5 = require("ffi/sha2").md5
local util = require("util")

local Reading = {}

local function hash(text)
    local update = md5()
    update(text)
    return update()
end

-- A UUID that is always the same for the same text.
function Reading.stableId(text)
    local h = hash(text)
    local variant = string.format("%x", 8 + tonumber(h:sub(17, 17), 16) % 4)
    return h:sub(1, 8) .. "-" .. h:sub(9, 12) .. "-4" .. h:sub(14, 16) .. "-" .. variant .. h:sub(18, 20) .. "-"
        .. h:sub(21, 32)
end

-- KOReader's own identity for a book file: the hash of samples of its content.
function Reading.bookKey(file, doc_settings)
    local key = doc_settings and doc_settings:readSetting("partial_md5_checksum")
    return key or util.partialMD5(file)
end

local function status(summary_status)
    if summary_status == "complete" then return "finished" end
    if summary_status == "abandoned" then return "abandoned" end
    return "reading"
end

-- "2026-11-23 15:20:05" (KOReader's datetime format) as epoch milliseconds.
local function parseDatetime(text)
    if type(text) ~= "string" then return nil end
    local y, mo, d, h, mi, s = text:match("^(%d+)-(%d+)-(%d+) (%d+):(%d+):(%d+)")
    if not y then
        y, mo, d = text:match("^(%d+)-(%d+)-(%d+)")
        if not y then return nil end
        h, mi, s = 12, 0, 0
    end
    return os.time{ year = y, month = mo, day = d, hour = h, min = mi, sec = s } * 1000
end

local function highlightsOf(key, settings)
    local result = {}
    for _, item in ipairs(settings:readSetting("annotations") or {}) do
        -- An annotation without a drawer is a bookmark; its text is where it points.
        local kind = item.drawer and "highlight" or "bookmark"
        local text = item.text and item.text ~= "" and item.text
            or (kind == "bookmark" and ("Page " .. tostring(item.pageno or "?")))
        if text then
            local position = type(item.pos0) == "table" and (item.pos0.page or "") or tostring(item.pos0 or item.page)
            table.insert(result, {
                id = Reading.stableId(kind .. ":" .. key .. ":" .. position .. ":" .. text),
                book_key = key,
                kind = kind,
                text = text,
                note = item.note,
                chapter = item.chapter,
                page = item.pageno and tostring(item.pageno) or nil,
                location = item.lexeme_location,
                highlighted_at = parseDatetime(item.datetime) or os.time() * 1000,
            })
        end
    end
    return result
end

-- Books in the reading history, with their highlights. Also returns each book's key by
-- the file name it may have been known by before it had a title, and when each book's
-- settings (highlights included) last changed, in seconds.
function Reading.books()
    local books, highlights, seen, aliases, changed_at = {}, {}, {}, {}, {}
    for _, entry in ipairs(ReadHistory.hist) do
        local file = entry.file
        if file and lfs.attributes(file, "mode") == "file" and DocSettings:hasSidecarFile(file) then
            local settings = DocSettings:open(file)
            local key = Reading.bookKey(file, settings)
            if key and not seen[key] then
                seen[key] = true
                local props = settings:readSetting("doc_props") or {}
                local summary = settings:readSetting("summary") or {}
                local function text(value) return type(value) == "string" and value ~= "" and value or nil end
                -- A book never opened in KOReader has no props yet; the library's copy of its metadata does.
                local listed = Books.forPath(file)
                aliases[file:match("([^/]+)%.[^.]+$")] = key
                local sidecar = DocSettings:findSidecarFile(file)
                changed_at[key] = sidecar and lfs.attributes(sidecar, "modification") or 0
                local title = text(props.title) or listed.title
                local progress = settings:readSetting("percent_finished")
                -- A book read to the end counts as read even if nobody marked it.
                local finished = summary.status == "complete" or (progress or 0) >= 1
                table.insert(books, {
                    id = Reading.stableId("book:" .. key),
                    key = key,
                    title = title,
                    authors = text(props.authors) or text(listed.authors),
                    series = text(props.series),
                    language = text(props.language),
                    description = text(props.description),
                    rating = tonumber(summary.rating) and summary.rating >= 1 and math.floor(summary.rating) or nil,
                    review = text(summary.note),
                    progress = progress,
                    status = finished and "finished" or status(summary.status),
                    pages = settings:readSetting("doc_pages"),
                    locations = settings:readSetting("lexeme_locations"),
                    last_read_at = (entry.time or 0) * 1000,
                    finished_at = finished and (parseDatetime(summary.modified) or (entry.time or 0) * 1000) or nil,
                })
                for _, h in ipairs(highlightsOf(key, settings)) do table.insert(highlights, h) end
            end
        end
    end
    return books, highlights, aliases, changed_at
end

--[[
Books deleted from the device: history entries whose file is gone but whose
settings still know the book's key. Books still present under another path are
left alone. Returns { key, file } pairs.
]]
function Reading.removedBooks(present)
    local removed = {}
    for _, entry in ipairs(ReadHistory.hist) do
        local file = entry.file
        if file and lfs.attributes(file, "mode") ~= "file" then
            local key = DocSettings:open(file):readSetting("partial_md5_checksum")
            if key and not present[key] then table.insert(removed, { key = key, file = file }) end
        end
    end
    return removed
end

-- Drops what's left of deleted books once Lexeme has been told, so they're sent once.
function Reading.forget(removed)
    for _, book in ipairs(removed) do
        DocSettings:open(book.file):purge()
        ReadHistory:removeItemByPath(book.file)
    end
end

local function query(path, sql)
    if lfs.attributes(path, "mode") ~= "file" then return {} end
    local SQ3 = require("lua-ljsqlite3/init")
    local conn = SQ3.open(path)
    local ok, columns = pcall(conn.exec, conn, sql)
    conn:close()
    local rows = {}
    if not ok or not columns then return rows end
    for i = 1, #columns[1] do
        local row = {}
        for c = 1, #columns do row[c] = columns[c][i] end
        table.insert(rows, row)
    end
    return rows
end

--[[
Every page visit the statistics plugin recorded since `since` (epoch seconds),
for books in `known_keys`: which page, when, for how long, and the book's page
count at the time.
]]
function Reading.pageReads(since, known_keys)
    local reads = {}
    for _, row in ipairs(query(DataStorage:getSettingsDir() .. "/statistics.sqlite3", string.format([[
        SELECT b.md5, p.page, p.start_time, p.duration, p.total_pages
        FROM page_stat_data p JOIN book b ON b.id = p.id_book
        WHERE p.start_time >= %d AND b.md5 IS NOT NULL;]], math.floor(since)))) do
        local key, page, start = row[1], tonumber(row[2]) or 0, tonumber(row[3]) or 0
        if known_keys[key] then
            table.insert(reads, {
                id = Reading.stableId("page:" .. key .. ":" .. page .. ":" .. start),
                book_key = key,
                page = page,
                total_pages = tonumber(row[5]) or 0,
                started_at = start * 1000,
                seconds = tonumber(row[4]) or 0,
            })
        end
    end
    return reads
end

-- Each book's page visits in the statistics database: how many, and when the last one started.
function Reading.pageReadCounts()
    local counts = {}
    for _, row in ipairs(query(DataStorage:getSettingsDir() .. "/statistics.sqlite3", [[
        SELECT b.md5, count(*), max(p.start_time)
        FROM page_stat_data p JOIN book b ON b.id = p.id_book
        WHERE b.md5 IS NOT NULL GROUP BY b.md5;]])) do
        counts[row[1]] = { count = tonumber(row[2]) or 0, last = tonumber(row[3]) or 0 }
    end
    return counts
end

-- How many of a book's page visits started at or before `last`.
function Reading.pageReadsUpTo(key, last)
    local rows = query(DataStorage:getSettingsDir() .. "/statistics.sqlite3", string.format([[
        SELECT count(*) FROM page_stat_data p JOIN book b ON b.id = p.id_book
        WHERE b.md5 = '%s' AND p.start_time <= %d;]], key:gsub("'", "''"), math.floor(last)))
    return rows[1] and tonumber(rows[1][1]) or 0
end

local CLOSERS = { '"', "'", ")", "”", "’", "»" }

local function endsSentence(token)
    local stripped = true
    while stripped do
        stripped = false
        for _, closer in ipairs(CLOSERS) do
            if #token > #closer and token:sub(-#closer) == closer then
                token = token:sub(1, -#closer - 1)
                stripped = true
            end
        end
    end
    return token:find("[%.%?!]$") ~= nil or token:sub(-3) == "…"
end

-- Cuts the words around a word down to the sentence that contains it.
local function sentenceOf(before, word, after)
    local head = {}
    for token in (before or ""):gmatch("%S+") do table.insert(head, token) end
    local first = 1
    for i = #head, 1, -1 do
        if endsSentence(head[i]) then
            first = i + 1
            break
        end
    end
    local tail = {}
    for token in (after or ""):gmatch("%S+") do
        table.insert(tail, token)
        if endsSentence(token) then break end
    end
    local prefix = table.concat(head, " ", first)
    local suffix = table.concat(tail, " ")
    local glued = after and not after:find("^%s")
    local text = (prefix ~= "" and prefix .. " " or "") .. word .. (glued and "" or " ") .. suffix
    return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- The sentence a word was read in, from the text Vocabulary Builder kept around it.
local function contextOf(before, word, after)
    local text = sentenceOf(before, word, after):gsub("%s+", " ")
    return text ~= word and text or nil
end

--[[
Words looked up in KOReader since `since`. The dictionary's lookup history has
every look-up; Vocabulary Builder keeps one row per word with the sentence it
was read in, which goes on the look-up it came from. A word only in Vocabulary
Builder is sent as its own look-up. Books are matched by title, the only thing
either knows them by.
]]
function Reading.lookups(since, key_by_title)
    local vocabulary = {}
    for _, row in ipairs(query(DataStorage:getSettingsDir() .. "/vocabulary_builder.sqlite3", string.format([[
        SELECT v.word, t.name, v.create_time, v.prev_context, v.next_context
        FROM vocabulary v LEFT JOIN title t ON t.id = v.title_id
        WHERE v.create_time >= %d;]], math.floor(since)))) do
        vocabulary[row[1]] = {
            title = row[2],
            at = tonumber(row[3]) or 0,
            context = contextOf(row[4], row[1], row[5]),
        }
    end

    local lookups = {}
    local ok, history = pcall(function()
        return require("luadata"):open(DataStorage:getSettingsDir() .. "/lookup_history.lua", "LookupHistory")
            :readSetting("lookup_history")
    end)
    for _, entry in ipairs(ok and history or {}) do
        if entry.word and (entry.time or 0) >= since then
            local saved = vocabulary[entry.word]
            local same = saved and math.abs(saved.at - entry.time) <= 60
            if same then saved.matched = true end
            table.insert(lookups, {
                id = Reading.stableId("koreader-lookup:" .. entry.word .. ":" .. tostring(entry.time)),
                book_key = entry.book_title and key_by_title[entry.book_title] or nil,
                word = entry.word,
                headword = Headwords.of(entry.word),
                context = same and saved.context or nil,
                looked_up_at = entry.time * 1000,
            })
        end
    end
    for word, saved in pairs(vocabulary) do
        if not saved.matched then
            table.insert(lookups, {
                id = Reading.stableId("koreader-vocabulary:" .. word),
                book_key = saved.title and key_by_title[saved.title] or nil,
                word = word,
                headword = Headwords.of(word),
                context = saved.context,
                looked_up_at = saved.at * 1000,
            })
        end
    end
    return lookups
end

--[[
Everything to send since the last sync. Books always go first so the rest
resolves. A page still open at the last sync keeps counting, so the last few
hours are always resent.
]]
function Reading.snapshot(since)
    local books, highlights, aliases, changed_at = Reading.books()
    local keys, key_by_title = {}, aliases
    for _, book in ipairs(books) do
        keys[book.key] = true
        key_by_title[book.title] = book.key
    end
    local recent = math.max(0, since - 6 * 3600)
    local removed = Reading.removedBooks(keys)
    local removed_keys = {}
    for _, book in ipairs(removed) do table.insert(removed_keys, book.key) end
    return {
        changed_at = changed_at,
        removed = removed,
        removed_book_keys = removed_keys,
        books = books,
        page_reads = Reading.pageReads(recent, keys),
        highlights = highlights,
        lookups = Reading.lookups(recent, key_by_title),
        key_by_title = key_by_title,
    }
end

return Reading
