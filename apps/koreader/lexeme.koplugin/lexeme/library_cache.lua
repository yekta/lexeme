--[[
What the library knew about each book when it last looked, kept in a file so that the first scan
after KOReader starts needn't open every book's settings file and look up every book's metadata
again: for 330 books that took ten seconds, with Home frozen. An entry counts only while what it
came from is unchanged: the book file's modification time for its title, authors and lock, and
its settings file's modification time and size for its reading state.
]]
local DataStorage = require("datastorage")
local DocSettings = require("docsettings")
local dump = require("dump")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")
local util = require("util")

local LibraryCache = {}

local FILE = "lexeme_library_cache.lua"
local VERSION = 1

local function filePath()
    return DataStorage:getSettingsDir() .. "/" .. FILE
end

-- What was last written, so an unchanged library isn't written again.
local written

--[[
{ metadata = { [path] = { mtime, meta } }, locked = { [path] = { mtime, locked } },
  info = { [path] = { sidecar = key, info = BookList's book info } } }, empty when there's none.
]]
function LibraryCache.load()
    local empty = { metadata = {}, locked = {}, info = {} }
    local f = io.open(filePath(), "rb")
    if not f then return empty end
    local text = f:read("*a")
    f:close()
    local chunk = text and loadstring(text)
    local ok, stored = false, nil
    if chunk then ok, stored = pcall(chunk) end
    if not ok or type(stored) ~= "table" or stored.version ~= VERSION then return empty end
    written = text
    return stored
end

-- The book's settings file, where KOReader keeps them, as "modification:size"; false when it
-- isn't there.
function LibraryCache.sidecarKey(book_path)
    local file = DocSettings:getSidecarDir(book_path) .. "/" .. DocSettings.getSidecarFilename(book_path)
    local attr = lfs.attributes(file)
    if not attr or attr.mode ~= "file" then return false end
    return attr.modification .. ":" .. attr.size
end

function LibraryCache.save(data)
    data.version = VERSION
    local text = "return " .. dump(data) .. "\n"
    if text == written then return end
    if util.writeToFile(text, filePath(), true) then
        written = text
    else
        logger.warn("Lexeme: couldn't write", filePath())
    end
end

return LibraryCache
