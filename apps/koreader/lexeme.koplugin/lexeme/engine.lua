--[[
crengine's cache of laid-out books, kept where it's quickest to read on a Kindle.

On recent firmware /mnt/us, where KOReader lives, is Amazon's FUSE layer (fsp) over the FAT
partition mounted at /mnt/base-us: reads through it run at about half the speed, and every call
costs CPU. A long book's cache, tens of MB read each time it opens, loads about a second sooner
from /mnt/base-us. They're the same files, so the cache stays where USB shows it.

A long book's cache is tens of MB, and KOReader keeps 64 MB of them, two or three long books;
Lexeme keeps 1 GB unless it's been set otherwise.

Two costs of opening a book are moved to while Home sits idle: the engine's start-up (fonts,
hyphenation, the cache; 1.6 s on the first book after KOReader starts), and the two full garbage
collections KOReader runs before every book opens (a quarter of a second).
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

-- Whether garbage was collected while Home sat idle, since the last book opened.
local collected = false

-- Done once Home has sat idle a few seconds.
function Engine.whileIdle()
    -- An engine that can't load is KOReader's to report when a book opens, not Home's.
    local ok, err = pcall(function() require("document/credocument"):engineInit() end)
    if not ok then require("logger").warn("Lexeme: engine start-up failed:", err) end
    collectgarbage()
    collectgarbage()
    collected = true
end

-- KOReader's opening, without its collections when Home has just done them.
local function openWithoutCollecting(open, ...)
    if not collected then return open(...) end
    collected = false
    local collect = collectgarbage
    rawset(_G, "collectgarbage", function(what, ...)
        if what == nil or what == "collect" then return 0 end
        return collect(what, ...)
    end)
    local ok, document = pcall(open, ...)
    rawset(_G, "collectgarbage", collect)
    if not ok then error(document, 0) end
    return document
end

-- A book's layout cache, read into memory while the reader starts up. crengine reads it in small
-- pieces from all over the file, and /mnt/base-us is a loop device that reads nothing ahead (nor
-- does posix_fadvise make it), so a long book's cache came in at a quarter of the card's speed:
-- Woolf's 18 MB took 4.3 s to load when it wasn't in memory, 1.4 s when it was. A child process
-- reading the file straight through brings it all in, in 0.7 s, meanwhile. Small caches aren't
-- worth it. crengine starts loading once the read is done (Engine.awaitReadAhead): reading
-- alongside it, both went at the scattered pace.
local READ_AHEAD_BYTES = 2 * 1024 * 1024
local READ_AHEAD_WAIT_SECONDS = 4
local reading
local spawn_declared
function Engine.readAhead(path)
    if type(path) ~= "string" or (lfs.attributes(path, "size") or 0) < READ_AHEAD_BYTES then return end
    local ffi = require("ffi")
    local C = ffi.C
    if spawn_declared == nil then
        require("ffi/posix_h")
        -- One by one: another plugin may have declared some of them already.
        for _, declaration in ipairs({
            "int posix_spawn(int *pid, const char *path, const void *file_actions, const void *attrp, char *const argv[], char *const envp[]);",
            "int posix_spawn_file_actions_init(void *file_actions);",
            "int posix_spawn_file_actions_addopen(void *file_actions, int fd, const char *path, int oflag, int mode);",
            "int posix_spawn_file_actions_destroy(void *file_actions);",
            "int posix_spawnattr_init(void *attr);",
            "int posix_spawnattr_setflags(void *attr, short flags);",
            "int posix_spawnattr_destroy(void *attr);",
            "extern char **environ;",
        }) do
            pcall(ffi.cdef, declaration)
        end
        spawn_declared = pcall(function()
            return C.posix_spawn, C.posix_spawn_file_actions_init, C.posix_spawn_file_actions_addopen,
                C.posix_spawn_file_actions_destroy, C.posix_spawnattr_init, C.posix_spawnattr_setflags,
                C.posix_spawnattr_destroy, C.environ
        end)
    end
    if not spawn_declared then return end
    -- cat, its output to /dev/null; vfork mode, so KOReader's memory isn't copied first.
    local actions, attr = ffi.new("uint64_t[32]"), ffi.new("uint64_t[64]")
    local pid = ffi.new("int[1]")
    local strings = { "/bin/cat", path }
    local keep, argv = {}, ffi.new("char *[3]")
    for i, str in ipairs(strings) do
        keep[i] = ffi.new("char[?]", #str + 1, str)
        argv[i - 1] = keep[i]
    end
    local res = -1
    if C.posix_spawn_file_actions_init(actions) == 0 then
        if C.posix_spawnattr_init(attr) == 0 then
            if C.posix_spawn_file_actions_addopen(actions, 1, "/dev/null", C.O_WRONLY, 0) == 0
                and C.posix_spawnattr_setflags(attr, 0x40) == 0 then -- POSIX_SPAWN_USEVFORK
                res = C.posix_spawn(pid, "/bin/cat", actions, attr, argv, C.environ)
            end
            C.posix_spawnattr_destroy(attr)
        end
        C.posix_spawn_file_actions_destroy(actions)
    end
    if res ~= 0 then return end
    reading = pid[0]
    -- Reaped once it's done, should nothing wait for it.
    local ffiutil = require("ffi/util")
    local UIManager = require("ui/uimanager")
    local child = reading
    local function reap()
        if not ffiutil.isSubProcessDone(child) then UIManager:scheduleIn(1, reap) end
    end
    UIManager:scheduleIn(1, reap)
end

-- Waits for the cache read started by Engine.readAhead, a few seconds at most; called just before
-- crengine loads the book.
function Engine.awaitReadAhead()
    if not reading then return end
    local child = reading
    reading = nil
    local ffiutil = require("ffi/util")
    local time = require("ui/time")
    local deadline = time.now() + time.s(READ_AHEAD_WAIT_SECONDS)
    while not ffiutil.isSubProcessDone(child) and time.now() < deadline do
        ffiutil.usleep(10000)
    end
end

function Engine.install()
    if G_reader_settings:hasNot("cre_disk_cache_max_size") then
        G_reader_settings:saveSetting("cre_disk_cache_max_size", CACHE_MB)
    end
    local CreDocument = require("document/credocument")
    if CreDocument.lexeme_cache then return end
    CreDocument.lexeme_cache = true
    local DocumentRegistry = require("document/documentregistry")
    local open = DocumentRegistry.openDocument
    DocumentRegistry.openDocument = function(...) return openWithoutCollecting(open, ...) end
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
