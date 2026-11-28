--[[
Amazon's reading history, from Kindle.zip in its "Request your data" export, written into
KOReader's statistics as page visits: this Kindle's stats count it, and syncing sends it to Lexeme
like any other reading. It covers every device on the account. Amazon keeps sessions, not pages,
so each book's sessions are spread over its pages in order. Importing again replaces the last import.
]]
local DataStorage = require("datastorage")
local DocSettings = require("docsettings")
local lfs = require("libs/libkoreader-lfs")

local AmazonLibrary = require("lexeme/amazon_library")

local AmazonHistory = {}

local SESSIONS = "Kindle.reading-insights-sessions_with_adjustments.csv"
local FINISHED = "Kindle.UserUniqueTitlesCompleted.csv"
local MISSING = { [""] = true, ["Not Available"] = true, ["Not Applicable"] = true }
-- For a book KOReader hasn't laid out: about what its default layout fits on a Kindle's page.
local LOCATIONS_PER_PAGE = 12

local SCHEMA = [[
CREATE TABLE IF NOT EXISTS lexeme_amazon_book
    (id_book INTEGER PRIMARY KEY, created INTEGER, finished_at INTEGER, last_read_at INTEGER);
CREATE TABLE IF NOT EXISTS lexeme_amazon_page
    (id_book INTEGER, page INTEGER, start_time INTEGER, PRIMARY KEY (id_book, page, start_time));
]]

local function statisticsPath()
    return DataStorage:getSettingsDir() .. "/statistics.sqlite3"
end

-- Kindle.zip, once copied to the Kindle's top folder or `home_dir`.
function AmazonHistory.findExport(home_dir)
    for _, dir in ipairs({ "/mnt/us", home_dir }) do
        local path = dir .. "/Kindle.zip"
        if lfs.attributes(path, "mode") == "file" then return path end
    end
end

-- The export's files named in `names`, by name.
local function readExport(path, names)
    local reader = require("ffi/archiver").Reader:new()
    if not reader:open(path) then return nil end
    local files = {}
    for entry in reader:iterate() do
        local name = entry.path:match("([^/]+)$")
        if entry.mode == "file" and names[name] then files[name] = reader:extractToMemory(entry.path) end
    end
    reader:close()
    return files
end

-- A CSV file's rows, keyed by its header's names.
local function csvRows(text)
    text = text:gsub("^\239\187\191", "")
    local records, record, pos, len = {}, {}, 1, #text
    while pos <= len do
        local value
        if text:sub(pos, pos) == '"' then
            local parts, i = {}, pos + 1
            while true do
                local quote = text:find('"', i, true)
                if not quote then
                    table.insert(parts, text:sub(i))
                    pos = len + 1
                    break
                end
                table.insert(parts, text:sub(i, quote - 1))
                if text:sub(quote + 1, quote + 1) ~= '"' then
                    pos = quote + 1
                    break
                end
                table.insert(parts, '"')
                i = quote + 2
            end
            value = table.concat(parts)
        else
            local stop = text:find("[,\r\n]", pos) or len + 1
            value = text:sub(pos, stop - 1)
            pos = stop
        end
        table.insert(record, value)
        local char = text:sub(pos, pos)
        if char == "," then
            pos = pos + 1
        else
            if char == "\r" then pos = pos + 1 end
            if text:sub(pos, pos) == "\n" then pos = pos + 1 end
            table.insert(records, record)
            record = {}
        end
    end
    local header, rows = records[1] or {}, {}
    for i = 2, #records do
        local row = {}
        for c, name in ipairs(header) do row[name] = records[i][c] end
        table.insert(rows, row)
    end
    return rows
end

-- Epoch seconds of a time in UTC, like "2026-11-23T09:49:55.600Z".
local function utcSeconds(iso)
    local y, m, d, hh, mm, ss = (iso or ""):match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
    if not y then return nil end
    y, m, d = tonumber(y), tonumber(m), tonumber(d)
    if m <= 2 then y = y - 1 end
    local era = math.floor(y / 400)
    local year_of_era = y - era * 400
    local day_of_year = math.floor((153 * (m + (m > 2 and -3 or 9)) + 2) / 5) + d - 1
    local day_of_era = year_of_era * 365 + math.floor(year_of_era / 4) - math.floor(year_of_era / 100) + day_of_year
    local days = era * 146097 + day_of_era - 719468
    return ((days * 24 + tonumber(hh)) * 60 + tonumber(mm)) * 60 + tonumber(ss)
end

local function trim(text)
    return (text or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

-- Each title's sessions and the Amazon ids it was read under, in the order first read.
local function titlesRead(text)
    local by_title, titles = {}, {}
    for _, row in ipairs(csvRows(text)) do
        local title = trim(row.product_name)
        local start = utcSeconds(row.start_time)
        local seconds = math.floor((tonumber(row.total_reading_milliseconds) or 0) / 1000 + 0.5)
        if not MISSING[title] and start and seconds > 0 then
            local book = by_title[title]
            if not book then
                book = { title = title, ids = {}, sessions = {} }
                by_title[title] = book
                table.insert(titles, book)
            end
            for _, id in ipairs({ row.ASIN or "", row.personal_document_id or "" }) do
                id = id:gsub('"', "")
                if not MISSING[id] and not book.ids[id] then
                    book.ids[id] = true
                    table.insert(book.ids, id)
                end
            end
            table.insert(book.sessions, { start = start, seconds = seconds })
        end
    end
    return titles
end

-- When each book was finished, by Amazon id and by title: noon of the day Amazon marked it.
local function finishedTimes(text)
    local times = {}
    for _, row in ipairs(csvRows(text or "")) do
        local id, y, m, d = (row.asin_date_and_content_type or ""):match("^([^_]*)_(%d+)-(%d+)-(%d+)")
        if y then
            local at = os.time{ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 }
            local document = (row.personal_document_id or ""):gsub('"', "")
            for _, key in ipairs({ MISSING[document] and id or document, trim(row.product_name) }) do
                if not MISSING[key] then times[key] = math.max(at, times[key] or 0) end
            end
        end
    end
    return times
end

local function pagesOf(conn, key, path)
    local stmt = conn:prepare("SELECT max(pages) FROM book WHERE md5 = ?;")
    local row = stmt:reset():bind(key):step()
    stmt:close()
    local pages = row and tonumber(row[1])
    if pages and pages > 0 then return pages end
    if not (path and DocSettings:hasSidecarFile(path)) then return 0 end
    local settings = DocSettings:open(path)
    local locations = tonumber(settings:readSetting("lexeme_locations"))
    return tonumber(settings:readSetting("doc_pages"))
        or locations and math.ceil(locations / LOCATIONS_PER_PAGE)
        or 0
end

--[[
The books read, by the key syncing knows each by: a converted copy's when there is one, or else
"kindle:" and the Amazon id, as the Kindle import keys them. Titles read under the same key are
one book.
]]
local function booksRead(conn, files, home_dir)
    local catalog = {}
    for _, row in ipairs(AmazonLibrary.books()) do
        if not catalog[row[1]] or (tonumber(row[5]) or 0) > 0 then catalog[row[1]] = row end
    end
    local by_title, metadata = AmazonLibrary.filesByTitle()
    local finished = finishedTimes(files[FINISHED])
    local by_key, books = {}, {}
    for _, read in ipairs(titlesRead(files[SESSIONS])) do
        local entry, cde
        for _, id in ipairs(read.ids) do
            if catalog[id] then
                entry, cde = catalog[id], id
                break
            end
        end
        local path, key = AmazonLibrary.convertedCopy(home_dir, entry and entry[7],
            entry and { entry[2], read.title } or { read.title }, by_title)
        key = key or (cde or read.ids[1]) and "kindle:" .. (cde or read.ids[1])
        if key then
            local book = by_key[key]
            if not book then
                local meta = path and metadata[path] or {}
                book = {
                    key = key,
                    title = meta.title or entry and entry[2] or read.title,
                    authors = meta.authors or entry and AmazonLibrary.authorsOf(entry[3]),
                    pages = pagesOf(conn, key, path),
                    percent = entry and tonumber(entry[4]),
                    sessions = {},
                    starts = {},
                }
                by_key[key] = book
                table.insert(books, book)
            end
            for _, id in ipairs(read.ids) do book.finished_at = math.max(book.finished_at or 0, finished[id] or 0) end
            book.finished_at = math.max(book.finished_at, finished[read.title] or 0)
            for _, session in ipairs(read.sessions) do
                -- A session listed twice keeps its longer copy.
                local same = book.starts[session.start]
                if not same then
                    book.starts[session.start] = session
                    table.insert(book.sessions, session)
                elseif session.seconds > same.seconds then
                    same.seconds = session.seconds
                end
            end
        end
    end
    for _, book in ipairs(books) do
        if book.finished_at == 0 then book.finished_at = nil end
        table.sort(book.sessions, function(a, b) return a.start < b.start end)
    end
    return books
end

--[[
Spreads a book's sessions over the pages it was read to, as one read from start to end: each
session takes the next stretch of pages, as long as its share of the time, split evenly over them.
Without a page count, each session is one visit to page 0.
]]
local function pageVisits(book)
    local visits = {}
    if book.pages < 1 then
        for _, session in ipairs(book.sessions) do
            table.insert(visits, { page = 0, start = session.start, seconds = session.seconds })
        end
        return visits
    end
    local pages = book.pages
    if not book.finished_at and book.percent and book.percent > 0 then
        pages = math.max(1, math.min(pages, math.ceil(pages * book.percent / 100)))
    end
    local total = 0
    for _, session in ipairs(book.sessions) do total = total + session.seconds end
    local done = 0
    for _, session in ipairs(book.sessions) do
        local from = done / total
        done = done + session.seconds
        local first = math.min(pages, math.floor(from * pages) + 1)
        local last = math.max(first, math.min(pages, math.floor(done / total * pages)))
        local count = last - first + 1
        local each = math.floor(session.seconds / count)
        for page = first, last do
            local seconds = page == last and session.seconds - each * (count - 1) or each
            table.insert(visits, { page = page, start = session.start + (page - first) * each, seconds = seconds })
        end
    end
    return visits
end

local function ids(conn, sql)
    local result = {}
    local columns = conn:exec(sql)
    for i = 1, columns and #columns[1] or 0 do table.insert(result, tonumber(columns[1][i])) end
    return result
end

-- Takes out what the last import wrote; returns the books it touched.
local function undoImport(conn)
    local touched = ids(conn, "SELECT id_book FROM lexeme_amazon_book;")
    conn:exec([[
        DELETE FROM page_stat_data WHERE (id_book, page, start_time) IN
            (SELECT id_book, page, start_time FROM lexeme_amazon_page);
        DELETE FROM lexeme_amazon_page;
        DELETE FROM book WHERE id IN (SELECT id_book FROM lexeme_amazon_book WHERE created = 1)
            AND NOT EXISTS (SELECT 1 FROM page_stat_data p WHERE p.id_book = book.id);
        DELETE FROM lexeme_amazon_book;]])
    return touched
end

local function writeImport(conn, books)
    local find = conn:prepare("SELECT id FROM book WHERE md5 = ? ORDER BY last_open DESC LIMIT 1;")
    local add_book = conn:prepare([[INSERT INTO book (title, authors, notes, last_open, highlights, pages, md5,
        total_read_time, total_read_pages) VALUES (?, ?, 0, ?, 0, ?, ?, 0, 0);]])
    local add_visit = conn:prepare("INSERT OR IGNORE INTO page_stat_data VALUES (?, ?, ?, ?, ?);")
    -- Only visits the import added are its own to take out again.
    local mark_visit = conn:prepare("INSERT OR IGNORE INTO lexeme_amazon_page SELECT ?, ?, ? WHERE changes() = 1;")
    local mark_book = conn:prepare("INSERT INTO lexeme_amazon_book VALUES (?, ?, ?, ?);")
    local summary = { books = 0, sessions = 0, seconds = 0 }
    for _, book in ipairs(books) do
        local last = book.sessions[#book.sessions]
        local last_read = last.start + last.seconds
        local found = find:reset():bind(book.key):step()
        local id_book = found and tonumber(found[1])
        if not id_book then
            add_book:reset():bind(book.title, book.authors or "N/A", last_read, book.pages, book.key):step()
            id_book = tonumber(conn:rowexec("SELECT last_insert_rowid();"))
        end
        for _, visit in ipairs(pageVisits(book)) do
            add_visit:reset():bind(id_book, visit.page, visit.start, visit.seconds, book.pages):step()
            mark_visit:reset():bind(id_book, visit.page, visit.start):step()
        end
        mark_book:reset():bind(id_book, found and 0 or 1, book.finished_at, last_read):step()
        summary.books = summary.books + 1
        summary.sessions = summary.sessions + #book.sessions
        for _, session in ipairs(book.sessions) do summary.seconds = summary.seconds + session.seconds end
    end
    for _, stmt in ipairs({ find, add_book, add_visit, mark_visit, mark_book }) do stmt:close() end
    return summary
end

local function updateTotals(conn, touched)
    conn:exec(string.format([[
        UPDATE book SET
            total_read_time = (SELECT coalesce(sum(duration), 0) FROM page_stat_data p WHERE p.id_book = book.id),
            total_read_pages = (SELECT count(DISTINCT page) FROM page_stat_data p WHERE p.id_book = book.id)
        WHERE id IN (SELECT id_book FROM lexeme_amazon_book) OR id IN (%s);]], table.concat(touched, ",")))
end

--[[
Imports the export at `path`, replacing the last import, and has the next sync send everything
again so Lexeme gets it. Returns { books, sessions, seconds }, or nil and why not.
]]
function AmazonHistory.import(path, home_dir)
    local stats = statisticsPath()
    if lfs.attributes(stats, "mode") ~= "file" then
        return nil, "Open a book first, so KOReader starts its statistics."
    end
    local files = readExport(path, { [SESSIONS] = true, [FINISHED] = true })
    if not files then return nil, "Couldn't open Kindle.zip." end
    if not files[SESSIONS] then return nil, "Kindle.zip has no reading sessions." end
    local conn = require("lua-ljsqlite3/init").open(stats)
    local ok, result = pcall(function()
        conn:exec(SCHEMA)
        local books = booksRead(conn, files, home_dir)
        conn:exec("BEGIN;")
        local touched = undoImport(conn)
        local summary = writeImport(conn, books)
        updateTotals(conn, touched)
        conn:exec("COMMIT;")
        return summary
    end)
    if not ok then pcall(conn.exec, conn, "ROLLBACK;") end
    conn:close()
    if not ok then return nil, tostring(result) end
    G_reader_settings:delSetting("lexeme_sync_version")
    return result
end

-- The imported books, as { key, title, authors, finished_at, last_read_at } in epoch seconds.
function AmazonHistory.books()
    local stats = statisticsPath()
    if lfs.attributes(stats, "mode") ~= "file" then return {} end
    local conn = require("lua-ljsqlite3/init").open(stats, "ro")
    local ok, columns = pcall(conn.exec, conn, [[
        SELECT b.md5, b.title, b.authors, a.finished_at, a.last_read_at
        FROM lexeme_amazon_book a JOIN book b ON b.id = a.id_book WHERE b.md5 IS NOT NULL;]])
    conn:close()
    local books = {}
    if not ok or not columns then return books end
    for i = 1, #columns[1] do
        local authors = columns[3][i]
        table.insert(books, {
            key = columns[1][i],
            title = columns[2][i],
            authors = authors ~= "N/A" and authors or nil,
            finished_at = tonumber(columns[4][i]),
            last_read_at = tonumber(columns[5][i]) or 0,
        })
    end
    return books
end

return AmazonHistory
