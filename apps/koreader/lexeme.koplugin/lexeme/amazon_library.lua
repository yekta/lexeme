--[[
What the Kindle's own reader knows about each book on the device, from its catalog
(/var/local/cc.db, opened read-only): how far into the book it got, whether the book is marked
as read, and when it was last opened. The library shows that progress for books KOReader hasn't
opened, and sorts by the later of the two readers' last opens, as the Kindle's library would.

A book converted from a Kindle book (documents/Converted/<name>.epub) shares its last open with
the original: Downloads/Items01/<name>_<key>.kfx, or for a store purchase copied over from an
earlier Kindle, documents/<name>_<ASIN>.kfx. When both exist, the one opened last counts.
]]
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local AmazonLibrary = {}

local CATALOG = "/var/local/cc.db"
local READ_STATE_READ = 2

local cache = { modification = nil }

-- A file's name without its folder, extension and the Kindle's "_<key>" suffix.
local function stem(path)
    local name = (path:match("([^/]+)$") or path):gsub("%.[^.]+$", "")
    local key = name:match("_([%dA-Z]+)$")
    if key and #key >= 10 then name = name:sub(1, #name - #key - 1) end
    return (name:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function load()
    local conn = require("lua-ljsqlite3/init").open(CATALOG, "ro")
    local ok, columns = pcall(conn.exec, conn,
        "SELECT p_location, p_percentFinished, p_lastAccess, p_readState FROM Entries " ..
        "WHERE p_type = 'Entry:Item' AND p_location IS NOT NULL;")
    conn:close()
    if not ok then error(columns) end
    local by_path, by_stem = {}, {}
    for i = 1, columns and #columns[1] or 0 do
        local path = columns[1][i]
        local entry = {
            percent = (tonumber(columns[2][i]) or 0) / 100,
            last_access = tonumber(columns[3][i]) or 0,
            read = tonumber(columns[4][i]) == READ_STATE_READ,
        }
        by_path[path] = entry
        if path:find("/Downloads/Items01/", 1, true) or path:match("^/mnt/us/documents/[^/]+%.kfx$") then
            local key = stem(path)
            local seen = by_stem[key]
            if not seen or entry.last_access > seen.last_access then by_stem[key] = entry end
        end
    end
    return by_path, by_stem
end

-- The catalog, reread when the Kindle changes it.
local function catalog()
    local modification = lfs.attributes(CATALOG, "modification")
    if not modification then return nil end
    if cache.modification ~= modification then
        local ok, by_path, by_stem = pcall(load)
        if not ok then
            logger.warn("Lexeme: can't read the Kindle's catalog:", by_path)
            return nil
        end
        cache = { modification = modification, by_path = by_path, by_stem = by_stem }
    end
    return cache
end

-- { percent = 0..1, last_access = epoch seconds, read = bool } for a book, or nil.
function AmazonLibrary.forPath(path)
    local c = catalog()
    if not c then return nil end
    local entry = c.by_path[path]
    if not entry and path:find("/Converted/", 1, true) then entry = c.by_stem[stem(path)] end
    return entry
end

return AmazonLibrary
