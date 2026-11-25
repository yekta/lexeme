--[[
Books sent from Lexeme: the Kindle downloads what's waiting into Books, one at
a time, and tells Lexeme it has them. While that happens the library shows
each one as Queued, then Downloading - N%, as the Kindle does.
]]
local Event = require("ui/event")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local Api = require("lexeme/api")
local Books = require("lexeme/books")

local Delivery = {}

-- What's coming, in order: { id, title, file_name, size_bytes, percent = nil | 0..100 }.
Delivery.pending = {}

local function changed()
    UIManager:broadcastEvent(Event:new("LexemeLibraryChanged"))
end

-- A free path in Books for `file_name`: "Title.epub", then "Title (2).epub" and so on.
local function destination(file_name)
    local dir = Books.homeDir() .. "/Books"
    lfs.mkdir(dir)
    local clean = file_name:gsub('[\\/:*?"<>|]+', "")
    local stem, ext = clean:match("^(.-)(%.[^.]+)$")
    stem, ext = stem or clean, ext or ""
    local path, n = dir .. "/" .. clean, 2
    while lfs.attributes(path, "mode") do
        path = string.format("%s/%s (%d)%s", dir, stem, n, ext)
        n = n + 1
    end
    return path
end

local function download(book)
    local path = destination(book.file_name)
    local partial = path .. ".part"
    local last = -1
    book.percent = 0
    changed()
    local ok, err = Api.download("/api/devices/books/" .. book.id .. "/file", partial, function(received)
        local percent = math.min(100, math.floor(received * 100 / math.max(1, book.size_bytes)))
        if percent >= last + 5 then
            last = percent
            book.percent = percent
            changed()
        end
    end)
    if not ok then return false, err end
    os.rename(partial, path)
    Api.post("/api/devices/books/" .. book.id .. "/delivered", {})
    return true
end

-- Downloads everything waiting; returns how many arrived and the error that stopped it, if any.
function Delivery.run()
    local ok, body = Api.get("/api/devices/books")
    if not ok then return 0, body end
    Delivery.pending = body.books or {}
    if #Delivery.pending == 0 then return 0 end
    changed()
    local arrived = 0
    while #Delivery.pending > 0 do
        local book = Delivery.pending[1]
        local done, err = download(book)
        if not done then
            logger.warn("Lexeme: couldn't download", book.title, err)
            Delivery.pending = {}
            changed()
            return arrived, err
        end
        table.remove(Delivery.pending, 1)
        arrived = arrived + 1
        changed()
    end
    return arrived
end

return Delivery
