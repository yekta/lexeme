--[[
What the Kindle's own reader knows about each book on the device, from its catalog
(/var/local/cc.db, opened read-only): how far into the book it got, whether the book is marked
as read, and when it was last opened. The library shows that progress for books KOReader hasn't
opened, and sorts by the later of the two readers' last opens, as the Kindle's library would.
]]
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local AmazonLibrary = {}

local CATALOG = "/var/local/cc.db"
local READ_STATE_READ = 2

local cache = { modification = nil }

local function load()
    local conn = require("lua-ljsqlite3/init").open(CATALOG, "ro")
    local ok, columns = pcall(conn.exec, conn,
        "SELECT p_location, p_percentFinished, p_lastAccess, p_readState FROM Entries " ..
        "WHERE p_type = 'Entry:Item' AND p_location IS NOT NULL;")
    conn:close()
    if not ok then error(columns) end
    local entries = {}
    for i = 1, columns and #columns[1] or 0 do
        entries[columns[1][i]] = {
            percent = (tonumber(columns[2][i]) or 0) / 100,
            last_access = tonumber(columns[3][i]) or 0,
            read = tonumber(columns[4][i]) == READ_STATE_READ,
        }
    end
    return entries
end

-- The catalog, reread when the Kindle changes it.
local function catalog()
    local modification = lfs.attributes(CATALOG, "modification")
    if not modification then return nil end
    if cache.modification ~= modification then
        local ok, entries = pcall(load)
        if not ok then
            logger.warn("Lexeme: can't read the Kindle's catalog:", entries)
            return nil
        end
        cache = { modification = modification, entries = entries }
    end
    return cache.entries
end

-- { percent = 0..1, last_access = epoch seconds, read = bool } for a book, or nil.
function AmazonLibrary.forPath(path)
    local entries = catalog()
    return entries and entries[path]
end

return AmazonLibrary
