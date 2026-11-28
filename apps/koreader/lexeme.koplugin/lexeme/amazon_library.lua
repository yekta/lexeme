--[[
What the Kindle's own reader knows about each book on the device, from its catalog
(/var/local/cc.db, opened read-only): how far into the book it got, whether the book is marked
as read, and when it was last opened. The library shows that progress for books KOReader hasn't
opened, and sorts by the later of the two readers' last opens, as the Kindle's library would.

A book in documents/Converted is a copy of a Kindle book and takes the original's state: the
original named in the copy's "_<key>" suffix if it has one, else the original with the same name
(documents/<name>_<key>.<ext>, usually in Downloads/Items01); when several share the name, the
one opened last. The Kindle indexes the MOBI-family copies in Converted too, as just opened, so
the copies' own catalog entries are never used.
]]
local DocSettings = require("docsettings")
local JSON = require("json")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")
local utf8proc = require("ffi/utf8proc")
local util = require("util")

local AmazonLibrary = {}

local CATALOG = "/var/local/cc.db"
local READ_STATE_READ = 2

local cache = { modification = nil }

-- A file's name without its folder, extension and the Kindle's "_<key>" suffix, and the key.
local function stem(path)
    local name = (path:match("([^/]+)$") or path):gsub("%.[^.]+$", "")
    local key = name:match("_([%dA-Z]+)$")
    if key and #key >= 10 then
        name = name:sub(1, #name - #key - 1)
    else
        key = nil
    end
    return (name:gsub("^%s+", ""):gsub("%s+$", "")), key
end

local function load()
    local conn = require("lua-ljsqlite3/init").open(CATALOG, "ro")
    local ok, columns = pcall(conn.exec, conn,
        "SELECT p_location, p_percentFinished, p_lastAccess, p_readState FROM Entries " ..
        "WHERE p_type = 'Entry:Item' AND p_location IS NOT NULL;")
    conn:close()
    if not ok then error(columns) end
    local by_path, by_stem, by_key = {}, {}, {}
    for i = 1, columns and #columns[1] or 0 do
        local path = columns[1][i]
        local entry = {
            percent = (tonumber(columns[2][i]) or 0) / 100,
            last_access = tonumber(columns[3][i]) or 0,
            read = tonumber(columns[4][i]) == READ_STATE_READ,
        }
        by_path[path] = entry
        local name, key = stem(path)
        if key and not path:find("/Converted/", 1, true) then
            by_key[key] = entry
            local seen = by_stem[name]
            if not seen or entry.last_access > seen.last_access then by_stem[name] = entry end
        end
    end
    return by_path, by_stem, by_key
end

-- The catalog, reread when the Kindle changes it.
local function catalog()
    local modification = lfs.attributes(CATALOG, "modification")
    if not modification then return nil end
    if cache.modification ~= modification then
        local ok, by_path, by_stem, by_key = pcall(load)
        if not ok then
            logger.warn("Lexeme: can't read the Kindle's catalog:", by_path)
            return nil
        end
        cache = { modification = modification, by_path = by_path, by_stem = by_stem, by_key = by_key }
    end
    return cache
end

-- { percent = 0..1, last_access = epoch seconds, read = bool } for a book, or nil.
function AmazonLibrary.forPath(path)
    local c = catalog()
    if not c then return nil end
    if path:find("/Converted/", 1, true) then
        local name, key = stem(path)
        return key and c.by_key[key] or c.by_stem[name]
    end
    return c.by_path[path]
end

-- The catalog's store books and personal documents, not the copies in Converted, as rows of
-- { cde key, title, credits JSON, percent finished (0..100), last opened (epoch seconds), read state,
-- location }.
function AmazonLibrary.books()
    if lfs.attributes(CATALOG, "mode") ~= "file" then return {} end
    local conn = require("lua-ljsqlite3/init").open(CATALOG, "ro")
    local ok, columns = pcall(conn.exec, conn, [[
        SELECT p_cdeKey, p_titles_0_nominal, j_credits, p_percentFinished, p_lastAccess, p_readState, p_location
        FROM Entries WHERE p_cdeType IN ('EBOK', 'PDOC') AND p_cdeKey IS NOT NULL
          AND p_titles_0_nominal IS NOT NULL
          AND (p_location IS NULL OR p_location NOT LIKE '%/Converted/%');]])
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

-- "Anthony Burgess, ..." from the catalog's credits.
function AmazonLibrary.authorsOf(credits)
    local ok, list = pcall(JSON.decode, credits or "")
    if not ok or type(list) ~= "table" then return nil end
    local names = {}
    for _, credit in ipairs(list) do
        local name = type(credit.name) == "table" and credit.name.display
        if name then table.insert(names, name) end
    end
    return #names > 0 and table.concat(names, ", ") or nil
end

-- Amazon keeps titles in decomposed Unicode.
local function composed(text)
    local ok, result = pcall(utf8proc.normalize_NFC, text)
    return ok and result or text
end

-- The library's files by lowercased title, for `convertedCopy`, and each file's { title, authors },
-- as the library last read them.
function AmazonLibrary.filesByTitle()
    local files, metadata = {}, {}
    for path, known in pairs(require("lexeme/library_cache").load().metadata) do
        local meta = type(known.meta) == "table" and known.meta
        if meta and meta.title and lfs.attributes(path, "mode") == "file" then
            files[composed(meta.title):lower()] = path
            metadata[path] = meta
        end
    end
    return files, metadata
end

local CONVERTED_TYPES = { "epub", "azw3", "azw", "mobi" }

-- The copy in documents/Converted, named after the Amazon file at `location` without the Kindle's
-- "_<key>" suffix (else with its whole name), in composed Unicode and without the space Amazon
-- sometimes puts in front, as the conversion names them.
local function copyInConverted(home_dir, location)
    local name = type(location) == "string" and location:match("([^/]+)%.[^./]+$")
    if not name then return nil end
    local names = { name }
    local key = name:match("_([%dA-Z]+)$")
    if key and #key >= 10 then table.insert(names, 1, name:sub(1, #name - #key - 1)) end
    for _, candidate in ipairs(names) do
        -- A combining accent left after a space belongs to the letter before it.
        candidate = candidate:gsub("(%w) (\204[\128-\191])", "%1%2"):gsub("(%w) (\205[\128-\175])", "%1%2")
        candidate = composed(candidate):gsub("^%s+", ""):gsub("%s+$", "")
        for _, ext in ipairs(CONVERTED_TYPES) do
            local path = home_dir .. "/Converted/" .. candidate .. "." .. ext
            if lfs.attributes(path, "mode") == "file" then return path end
        end
    end
end

-- A copy in documents/Books named after one of `titles`, or a book in `files_by_title` with one.
local function copyByTitle(home_dir, titles, files_by_title)
    for _, title in ipairs(titles) do
        local name = composed(title):gsub('[\\/:*?"<>|]+', ""):gsub("^%s+", ""):gsub("[%s%.]+$", ""):sub(1, 150)
        local path = home_dir .. "/Books/" .. name .. ".epub"
        if lfs.attributes(path, "mode") == "file" then return path end
        path = files_by_title and files_by_title[composed(title):lower()]
        if path then return path end
    end
end

--[[
KOReader's copy of an Amazon book, and the key syncing knows it by (what KOReader keeps for the
copy; the file's checksum can since differ): the copy in Converted of the Amazon file at
`location`, else one found by `titles`. Nil when there's none.
]]
function AmazonLibrary.convertedCopy(home_dir, location, titles, files_by_title)
    local path = copyInConverted(home_dir, location) or copyByTitle(home_dir, titles, files_by_title)
    if not path then return nil end
    local settings = DocSettings:hasSidecarFile(path) and DocSettings:open(path)
    return path, settings and settings:readSetting("partial_md5_checksum") or util.partialMD5(path)
end

return AmazonLibrary
