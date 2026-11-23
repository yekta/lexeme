--[[
What KOReader knows about the reading on this device, shaped for the server's
sync-reading: books from the history, time per day from the statistics
plugin's database, and highlights from each book's annotations. Ids are derived
from stable keys, so the same data always produces the same ids.
]]
local DataStorage = require("datastorage")
local DocSettings = require("docsettings")
local ReadHistory = require("readhistory")
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
        if item.drawer and item.text and item.text ~= "" then
            local position = type(item.pos0) == "table" and (item.pos0.page or "") or tostring(item.pos0 or item.page)
            table.insert(result, {
                id = Reading.stableId("highlight:" .. key .. ":" .. position .. ":" .. item.text),
                book_key = key,
                text = item.text,
                note = item.note,
                chapter = item.chapter,
                page = item.pageno and tostring(item.pageno) or nil,
                highlighted_at = parseDatetime(item.datetime) or os.time() * 1000,
            })
        end
    end
    return result
end

-- Books in the reading history, with their highlights. Returns books, highlights.
function Reading.books()
    local books, highlights, seen = {}, {}, {}
    for _, entry in ipairs(ReadHistory.hist) do
        local file = entry.file
        if file and lfs.attributes(file, "mode") == "file" and DocSettings:hasSidecarFile(file) then
            local settings = DocSettings:open(file)
            local key = Reading.bookKey(file, settings)
            if key and not seen[key] then
                seen[key] = true
                local props = settings:readSetting("doc_props") or {}
                local summary = settings:readSetting("summary") or {}
                local title = props.title and props.title ~= "" and props.title or file:match("([^/]+)%.[^.]+$")
                local finished = summary.status == "complete"
                table.insert(books, {
                    id = Reading.stableId("book:" .. key),
                    key = key,
                    title = title,
                    authors = props.authors,
                    progress = settings:readSetting("percent_finished"),
                    status = status(summary.status),
                    pages = settings:readSetting("doc_pages"),
                    last_read_at = (entry.time or 0) * 1000,
                    finished_at = finished and (parseDatetime(summary.modified) or (entry.time or 0) * 1000) or nil,
                })
                for _, h in ipairs(highlightsOf(key, settings)) do table.insert(highlights, h) end
            end
        end
    end
    return books, highlights
end

--[[
Reading time per book per local day, from the statistics plugin's database,
for days on or after `since` (epoch seconds). Only books in `known_keys` are
included, since the server needs the book before its days.
]]
function Reading.days(since, known_keys)
    local path = DataStorage:getSettingsDir() .. "/statistics.sqlite3"
    if lfs.attributes(path, "mode") ~= "file" then return {} end
    local SQ3 = require("lua-ljsqlite3/init")
    local conn = SQ3.open(path)
    local ok, rows = pcall(conn.exec, conn, string.format([[
        SELECT b.md5, strftime('%%Y-%%m-%%d', p.start_time, 'unixepoch', 'localtime') AS day,
               sum(p.duration), count(DISTINCT p.page)
        FROM page_stat_data p JOIN book b ON b.id = p.id_book
        WHERE p.start_time >= %d AND b.md5 IS NOT NULL
        GROUP BY b.md5, day;]], math.floor(since)))
    conn:close()
    local days = {}
    if not ok or not rows then return days end
    for i = 1, #rows[1] do
        local key = rows[1][i]
        if known_keys[key] then
            table.insert(days, {
                id = Reading.stableId("day:" .. key .. ":" .. rows[2][i]),
                book_key = key,
                day = rows[2][i],
                seconds = tonumber(rows[3][i]) or 0,
                pages = tonumber(rows[4][i]) or 0,
            })
        end
    end
    return days
end

--[[
Everything to send since the last sync, as sync-reading bodies of at most
`chunk` rows each. Books always go first so their days and highlights resolve.
]]
function Reading.snapshot(since)
    local books, highlights = Reading.books()
    local keys = {}
    for _, book in ipairs(books) do keys[book.key] = true end
    -- A day already sent keeps changing until it's over, so the last one is always resent.
    local days = Reading.days(math.max(0, since - 24 * 3600), keys)
    return { books = books, days = days, highlights = highlights, lookups = {} }
end

return Reading
