--[[
Sends what's waiting to Lexeme: queued words first, then the reading done since
the last sync. Everything goes through the outbox, so a sync cut short by the
network picks up where it stopped.
]]
local NetworkMgr = require("ui/network/manager")
local logger = require("logger")

local Api = require("lexeme/api")
local Outbox = require("lexeme/outbox")
local Reading = require("lexeme/reading")

local Sync = {}

-- Bumped when a sync starts sending something new, so the next one sends it all.
local SYNC_VERSION = 2

local CHUNK = { books = 200, page_reads = 2000, highlights = 500, lookups = 500 }

function Sync.isConnected()
    return Api.token() ~= nil
end

-- Remembers the account's email, which Settings shows; returns it.
function Sync.fetchAccount()
    local ok, body = Api.get("/api/v1/me")
    local email = ok and type(body.user) == "table" and body.user.email
    if email then G_reader_settings:saveSetting("lexeme_user_email", email) end
    return email
end

function Sync.lastSyncedAt()
    return G_reader_settings:readSetting("lexeme_synced_at")
end

--[[
Queues `snapshot` as sync-reading bodies of at most CHUNK rows of one kind,
books first. Each body carries only its own kind: an empty Lua table would be
sent as a JSON object, which the server refuses.
]]
function Sync.queueReading(snapshot)
    local queued = false
    for _, kind in ipairs({ "books", "page_reads", "highlights", "lookups" }) do
        local rows = snapshot[kind] or {}
        for first = 1, #rows, CHUNK[kind] do
            local body = { [kind] = {} }
            for i = first, math.min(#rows, first + CHUNK[kind] - 1) do table.insert(body[kind], rows[i]) end
            Outbox.push("reading", body)
            queued = true
        end
    end
    return queued
end

local function changedSince(snapshot, since)
    if since == 0 then return snapshot end
    local books, changed = {}, {}
    for _, book in ipairs(snapshot.books) do
        if (book.last_read_at or 0) >= since * 1000 then
            table.insert(books, book)
            changed[book.key] = true
        end
    end
    local highlights = {}
    for _, highlight in ipairs(snapshot.highlights) do
        if changed[highlight.book_key] then table.insert(highlights, highlight) end
    end
    return { books = books, page_reads = snapshot.page_reads, highlights = highlights, lookups = snapshot.lookups }
end

local running = false

--[[
Returns ok, message. Does nothing without a connection to Lexeme or the
network; `on_done(ok, message)` is called either way.
]]
function Sync.run(on_done)
    on_done = on_done or function() end
    if running then return on_done(false, "A sync is already running.") end
    if not Sync.isConnected() then return on_done(false, "Connect to Lexeme first.") end
    if not NetworkMgr:isOnline() then return on_done(false, "No internet connection.") end
    running = true
    local ok, err = pcall(function()
        local started = os.time()
        if not G_reader_settings:readSetting("lexeme_user_email") then Sync.fetchAccount() end
        local since = G_reader_settings:readSetting("lexeme_sync_version") == SYNC_VERSION
            and Sync.lastSyncedAt() or 0
        Sync.queueReading(changedSince(Reading.snapshot(since), since))
        local _, failure = Outbox.flush()
        if failure then error(failure, 0) end
        local _, delivery_failure = require("lexeme/delivery").run()
        if delivery_failure then error(delivery_failure, 0) end
        G_reader_settings:saveSetting("lexeme_synced_at", started)
        G_reader_settings:saveSetting("lexeme_sync_version", SYNC_VERSION)
    end)
    running = false
    if not ok then
        logger.warn("Lexeme: sync failed:", err)
        return on_done(false, tostring(err))
    end
    on_done(true, "Synced with Lexeme.")
end

local scheduled = false

-- Syncs a few seconds from now, quietly; repeated calls in the meantime are folded into one.
function Sync.soon()
    if scheduled or not Sync.isConnected() then return end
    scheduled = true
    require("ui/uimanager"):scheduleIn(3, function()
        scheduled = false
        if NetworkMgr:isOnline() then Sync.run() end
    end)
end

function Sync.disconnect()
    G_reader_settings:delSetting("lexeme_token")
    G_reader_settings:delSetting("lexeme_user_name")
    G_reader_settings:delSetting("lexeme_user_email")
    G_reader_settings:delSetting("lexeme_synced_at")
    G_reader_settings:delSetting("lexeme_deck_id")
    G_reader_settings:delSetting("lexeme_deck_name")
end

return Sync
