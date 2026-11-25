--[[
Things to send to Lexeme, kept on the device until the server confirms them.
Entries carry an id minted here, so sending one twice (the reply was lost, the
Kindle slept mid-request) changes nothing on the server.
]]
local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")
local logger = require("logger")

local Api = require("lexeme/api")

local Outbox = {}

math.randomseed(os.time() + math.floor(os.clock() * 1000000))

local function store()
    return LuaSettings:open(DataStorage:getSettingsDir() .. "/lexeme_outbox.lua")
end

-- A random v4 UUID; the server takes these as row ids.
function Outbox.uuid()
    local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return (template:gsub("[xy]", function(c)
        local v = c == "x" and math.random(0, 15) or math.random(8, 11)
        return string.format("%x", v)
    end))
end

function Outbox.entries()
    return store():readSetting("entries") or {}
end

local function save(entries)
    local settings = store()
    settings:saveSetting("entries", entries)
    settings:flush()
end

-- `kind` is "word", "reading" or "review"; `body` is what gets posted.
function Outbox.push(kind, body)
    local entries = Outbox.entries()
    table.insert(entries, { id = Outbox.uuid(), kind = kind, body = body, queued_at = os.time() })
    save(entries)
end

local PATHS = {
    word = function() return "/api/v1/words" end,
    reading = function() return "/api/v1/reading" end,
    review = function(body) return "/api/v1/cards/" .. body.card_id .. "/review" end,
}

local listeners = {}

-- Calls `fn(entry, reply)` for each entry of `kind` the server accepts.
function Outbox.listen(kind, fn)
    listeners[kind] = fn
end

local function drop(id)
    local kept = {}
    for _, entry in ipairs(Outbox.entries()) do
        if entry.id ~= id then table.insert(kept, entry) end
    end
    save(kept)
end

--[[
Sends entries oldest first and drops each one the server accepts. Stops at the
first network failure, so the rest wait for the next connection. An entry the
server refuses for good (it will never accept it) is dropped and logged.
Returns the number sent and the error that stopped it, if any.
]]
function Outbox.flush()
    local sent = 0
    while true do
        local entry = Outbox.entries()[1]
        if not entry then return sent end
        local ok, result, status = Api.post(PATHS[entry.kind](entry.body), entry.body)
        if ok then
            sent = sent + 1
            if listeners[entry.kind] then listeners[entry.kind](entry, result) end
        elseif Api.isPermanent(status) then
            if status == 401 then return sent, result end
            logger.warn("Lexeme: dropping", entry.kind, "the server refused:", result)
        else
            return sent, result
        end
        drop(entry.id)
    end
end

return Outbox
