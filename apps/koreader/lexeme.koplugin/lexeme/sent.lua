--[[
What this device had when it last synced: each book's highlight ids, every looked-up
word's id and how many page visits each book had. Compared with what it has now, it
tells Lexeme what was deleted here since. Only what KOReader recorded is compared, so
what came from Amazon's reader is never taken for deleted.
]]
local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")

local Reading = require("lexeme/reading")

local Sent = {}

local function store()
    return LuaSettings:open(DataStorage:getSettingsDir() .. "/lexeme_sent.lua")
end

local function missing(before, now)
    local present = {}
    for _, id in ipairs(now) do present[id] = true end
    local gone = {}
    for _, id in ipairs(before or {}) do
        if not present[id] then table.insert(gone, id) end
    end
    return gone
end

local function pageReadIds(key)
    local ids = {}
    for _, read in ipairs(Reading.pageReads(0, { [key] = true })) do table.insert(ids, read.id) end
    return ids
end

--[[
Adds to `outgoing` what was deleted since the last sync, judged by `snapshot`, everything
this device has now. Returns what to remember once `outgoing` has been sent.
]]
function Sent.addDeleted(snapshot, outgoing)
    local before = store():readSetting("sent") or {}
    local now = { highlights = {}, lookups = {}, page_reads = Reading.pageReadCounts() }
    for _, book in ipairs(snapshot.books) do now.highlights[book.key] = {} end
    for _, highlight in ipairs(snapshot.highlights) do
        table.insert(now.highlights[highlight.book_key], highlight.id)
    end
    for _, lookup in ipairs(Reading.lookups(0, snapshot.key_by_title)) do table.insert(now.lookups, lookup.id) end

    outgoing.removed_highlight_ids = {}
    for key, ids in pairs(now.highlights) do
        for _, id in ipairs(missing((before.highlights or {})[key], ids)) do
            table.insert(outgoing.removed_highlight_ids, id)
        end
    end
    outgoing.removed_lookup_ids = missing(before.lookups, now.lookups)

    -- A book whose earlier page visits number fewer than they did lost some: send all it has left.
    -- An empty list is left out, which Lexeme reads as none.
    outgoing.book_page_reads = {}
    for key in pairs(now.highlights) do
        local had = (before.page_reads or {})[key]
        if had and Reading.pageReadsUpTo(key, had.last) < had.count then
            local ids = pageReadIds(key)
            table.insert(outgoing.book_page_reads, { book_key = key, page_read_ids = #ids > 0 and ids or nil })
        end
    end
    return now
end

function Sent.remember(now)
    local settings = store()
    settings:saveSetting("sent", now)
    settings:flush()
end

return Sent
