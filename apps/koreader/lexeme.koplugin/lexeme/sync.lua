--[[
Sends what's waiting to Lexeme: queued words first, then the reading done since
the last sync. Everything goes through the outbox, so a sync cut short by the
network picks up where it stopped.
]]
local Event = require("ui/event")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local logger = require("logger")

local Api = require("lexeme/api")
local Background = require("lexeme/background")
local Outbox = require("lexeme/outbox")
local Reading = require("lexeme/reading")
local Sent = require("lexeme/sent")
local Streak = require("lexeme/streak")

local Sync = {}

-- Bumped when a sync starts sending something new, so the next one sends it all.
local SYNC_VERSION = 5

local CHUNK = {
    books = 200, page_reads = 2000, highlights = 500, lookups = 500,
    book_page_reads = 1, removed_highlight_ids = 1000, removed_lookup_ids = 1000, removed_book_keys = 500,
}
local KINDS = {
    "books", "page_reads", "highlights", "lookups",
    "book_page_reads", "removed_highlight_ids", "removed_lookup_ids", "removed_book_keys",
}

function Sync.isConnected()
    return Api.token() ~= nil
end

-- Dev mode (scripts/dev-mode.sh) keeps everything from the owner's Lexeme; a dev server is fair game.
function Sync.isPaused()
    return G_reader_settings:isTrue("lexeme_dev_mode") and Api.isDefaultServer()
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
    for _, kind in ipairs(KINDS) do
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
        -- Opened since the last sync, or changed since: a highlight made after a sync mid-book.
        if (book.last_read_at or 0) >= since * 1000 or (snapshot.changed_at[book.key] or 0) >= since then
            table.insert(books, book)
            changed[book.key] = true
        end
    end
    local highlights = {}
    for _, highlight in ipairs(snapshot.highlights) do
        if changed[highlight.book_key] then table.insert(highlights, highlight) end
    end
    return {
        books = books,
        page_reads = snapshot.page_reads,
        highlights = highlights,
        lookups = snapshot.lookups,
        removed = snapshot.removed,
        removed_book_keys = snapshot.removed_book_keys,
    }
end

local function isOnline()
    return Background.await(function() return NetworkMgr:isOnline() end)
end

local OFFLINE = "No internet connection."

-- Why the last sync failed, as { message, detail, at }, until one succeeds.
function Sync.lastFailure()
    return G_reader_settings:readSetting("lexeme_sync_failure")
end

local function remember(ok, message, detail)
    if ok then return G_reader_settings:delSetting("lexeme_sync_failure") end
    if message == OFFLINE then return end
    logger.warn("Lexeme: sync failed:", detail)
    G_reader_settings:saveSetting("lexeme_sync_failure", { message = message, detail = detail, at = os.time() })
end

local function syncAll()
    if not isOnline() then return false, OFFLINE end
    local started = os.time()
    if not G_reader_settings:readSetting("lexeme_user_email") then Sync.fetchAccount() end
    local since = G_reader_settings:readSetting("lexeme_sync_version") == SYNC_VERSION
        and Sync.lastSyncedAt() or 0
    local everything = Reading.snapshot(since)
    local snapshot = changedSince(everything, since)
    local now = Sent.addDeleted(everything, snapshot)
    Sync.queueReading(snapshot)
    Reading.forget(snapshot.removed)
    local _, failure = Outbox.flush()
    if failure then return false, failure end
    Sent.remember(now)
    -- With this Kindle's reading in, the streak Home shows is up to date.
    if Streak.refresh() then
        UIManager:broadcastEvent(Event:new("LexemeStreakChanged"))
    end
    require("lexeme/study").refresh()
    local _, delivery_failure = require("lexeme/delivery").run()
    if delivery_failure then return false, delivery_failure end
    G_reader_settings:saveSetting("lexeme_synced_at", started)
    G_reader_settings:saveSetting("lexeme_sync_version", SYNC_VERSION)
    return true, "Synced with Lexeme."
end

--[[
Syncs in the background. Does nothing without a connection to Lexeme or the
network; `on_done(ok, message)` is called either way. Without `on_done`, a
failure shows in a toast.
]]
function Sync.run(on_done)
    local done = on_done or function() end
    if not Sync.isConnected() then return done(false, "Connect to Lexeme first.") end
    if Sync.isPaused() then return done(false, "Syncing is paused in dev mode.") end
    local started = Background.run(function()
        local ok, synced, message = pcall(syncAll)
        local detail = message
        if not ok then
            synced, message, detail = false, "Couldn't sync with Lexeme.", tostring(synced)
        end
        remember(synced, message, detail)
        if not on_done and not synced and message ~= OFFLINE then require("lexeme/toast").show(message) end
        UIManager:broadcastEvent(Event:new("LexemeSyncFinished"))
        done(synced, message)
    end, "sync")
    if not started then done(false, "A sync is already running.") end
end

local scheduled = false

-- Syncs a few seconds from now, quietly; repeated calls in the meantime are folded into one.
function Sync.soon()
    if scheduled or not Sync.isConnected() or Sync.isPaused() then return end
    scheduled = true
    UIManager:scheduleIn(3, function()
        scheduled = false
        Sync.run()
    end)
end

-- Syncs once the lock screen is drawn; the Kindle stays on Wi-Fi for a minute before it sleeps.
function Sync.beforeSleep()
    if not Sync.isConnected() or Sync.isPaused() then return end
    UIManager:tickAfterNext(function() Sync.run(function() end) end)
end

-- Waking, the Kindle rejoins Wi-Fi on its own a few seconds later, without KOReader hearing of it.
local WAKE_CHECKS, WAKE_INTERVAL = 20, 3
local wake_checks = 0

local function syncOnceOnline()
    wake_checks = wake_checks + 1
    Background.run(function()
        if NetworkMgr:isConnected() and isOnline() then return Sync.run() end
        if wake_checks < WAKE_CHECKS then UIManager:scheduleIn(WAKE_INTERVAL, syncOnceOnline) end
    end, "wake_check")
end

-- Syncs once the Kindle is back online after waking, picking up books sent to it while it slept.
function Sync.afterWake()
    if not Sync.isConnected() or Sync.isPaused() then return end
    UIManager:unschedule(syncOnceOnline)
    wake_checks = 0
    UIManager:scheduleIn(WAKE_INTERVAL, syncOnceOnline)
end

function Sync.disconnect()
    G_reader_settings:delSetting("lexeme_token")
    G_reader_settings:delSetting("lexeme_user_name")
    G_reader_settings:delSetting("lexeme_user_email")
    G_reader_settings:delSetting("lexeme_synced_at")
    G_reader_settings:delSetting("lexeme_sync_failure")
    G_reader_settings:delSetting("lexeme_deck_id")
    G_reader_settings:delSetting("lexeme_deck_name")
    require("lexeme/study").forget()
end

return Sync
