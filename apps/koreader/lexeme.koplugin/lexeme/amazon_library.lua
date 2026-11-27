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
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

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

return AmazonLibrary
