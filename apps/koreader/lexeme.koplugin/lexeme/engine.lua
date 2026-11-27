--[[
crengine's cache of laid-out books, kept where it's quickest to read on a Kindle.

On recent firmware /mnt/us, where KOReader lives, is Amazon's FUSE layer (fsp) over the FAT
partition mounted at /mnt/base-us: reads through it run at about half the speed, and every call
costs CPU. A long book's cache, tens of MB read each time it opens, loads about a second sooner
from /mnt/base-us. They're the same files, so the cache stays where USB shows it.

A long book's cache is tens of MB, and KOReader keeps 64 MB of them, two or three long books;
Lexeme keeps 1 GB unless it's been set otherwise.
]]
local lfs = require("libs/libkoreader-lfs")

local Engine = {}

local CACHE_MB = 1024

-- The same folder on the FAT partition itself, when `dir` is under /mnt/us and it's there.
local function direct(dir)
    if dir:sub(1, 1) ~= "/" then
        local cwd = lfs.currentdir()
        if not cwd then return nil end
        dir = dir == "." and cwd or cwd .. "/" .. dir:gsub("^%./", "")
    end
    if not dir:match("^/mnt/us/") then return nil end
    local same = dir:gsub("^/mnt/us/", "/mnt/base-us/")
    if lfs.attributes(same, "mode") ~= "directory" then return nil end
    return same
end

function Engine.install()
    if G_reader_settings:hasNot("cre_disk_cache_max_size") then
        G_reader_settings:saveSetting("cre_disk_cache_max_size", CACHE_MB)
    end
    local CreDocument = require("document/credocument")
    if CreDocument.lexeme_cache then return end
    CreDocument.lexeme_cache = true
    local DataStorage = require("datastorage")
    local init = CreDocument.cacheInit
    -- KOReader sets the cache up in DataStorage:getDataDir() .. "/cache/cr3cache".
    CreDocument.cacheInit = function(...)
        local get = DataStorage.getDataDir
        local ok_dir, dir = pcall(direct, get(DataStorage))
        if ok_dir and dir then
            DataStorage.getDataDir = function() return dir end
        end
        local ok, err = pcall(init, ...)
        DataStorage.getDataDir = get
        if not ok then error(err, 0) end
    end
end

return Engine
