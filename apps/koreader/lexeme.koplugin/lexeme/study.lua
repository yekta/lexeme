--[[
The decks and the cards due in each, kept on the device so the Lexeme tab and a
study session work offline. Answers go through the outbox with the time they
were given, so Lexeme schedules an answer given offline as of when it was given.
]]
local DataStorage = require("datastorage")
local Event = require("ui/event")
local LuaSettings = require("luasettings")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local logger = require("logger")

local Api = require("lexeme/api")
local Background = require("lexeme/background")
local Outbox = require("lexeme/outbox")

local Study = {}

local QUEUE_LIMIT = 200
-- A card due back within this is shown again in the same session, as in Lexeme.
Study.SHORT_INTERVAL_MS = 30 * 60 * 1000
Study.RATINGS = { "again", "hard", "good", "easy" }

local function store()
    return LuaSettings:open(DataStorage:getSettingsDir() .. "/lexeme_study.lua")
end

-- Every deck as { id, name, card_count, retention, cards }, or nil before the first fetch.
function Study.decks()
    return store():readSetting("decks")
end

local function save(decks)
    local settings = store()
    settings:saveSetting("decks", decks)
    settings:flush()
end

function Study.forget()
    os.remove(DataStorage:getSettingsDir() .. "/lexeme_study.lua")
end

local function fetchQueue(deck_id)
    local ok, body = Api.get("/api/v1/decks/" .. deck_id .. "/study?limit=" .. QUEUE_LIMIT)
    if not ok or type(body) ~= "table" or type(body.cards) ~= "table" then return nil end
    local cards = {}
    for _, card in ipairs(body.cards) do
        table.insert(cards, {
            id = card.id, front = card.front, back = card.back, state = card.state, next = card.next,
        })
    end
    return cards
end

local waiting = {}

Outbox.listen("review", function(entry, reply)
    local on_next = waiting[entry.body.review_id]
    if not on_next then return end
    waiting[entry.body.review_id] = nil
    if type(reply) == "table" then on_next(reply.next) end
end)

-- Sends what waits in the outbox; false when some of it couldn't go.
local function sendWaiting()
    if require("lexeme/sync").isPaused() then return true end
    local _, failure = Outbox.flush()
    if failure then logger.warn("Lexeme: answers wait for the next sync:", failure) end
    return failure == nil
end

-- Fetches the decks and what's due in each, once answers given offline are in. Returns whether it got them.
local function fetchDecks()
    if not NetworkMgr:isConnected() or not sendWaiting() then return false end
    local ok, body = Api.get("/api/v1/decks")
    if not ok or type(body) ~= "table" or type(body.decks) ~= "table" then return false end
    local decks = {}
    for _, deck in ipairs(body.decks) do
        local due = (deck.new_count or 0) + (deck.learning_count or 0) + (deck.due_count or 0)
        local cards = due > 0 and fetchQueue(deck.id) or {}
        if not cards then return false end
        table.insert(decks, {
            id = deck.id,
            name = deck.name,
            card_count = deck.card_count or 0,
            retention = type(deck.retention) == "number" and deck.retention or nil,
            cards = cards,
        })
    end
    -- An answer given while fetching isn't in what came back; the session's own queue stays.
    for _, entry in ipairs(Outbox.entries()) do
        if entry.kind == "review" then return false end
    end
    save(decks)
    return true
end

-- Inside a background task; tells the screens when the decks changed.
function Study.refresh()
    if not fetchDecks() then return false end
    UIManager:broadcastEvent(Event:new("LexemeDecksChanged"))
    return true
end

function Study.refreshInBackground()
    Background.run(Study.refresh, "study_refresh")
end

-- Keeps what's left of a session, so leaving it (or the Kindle restarting) doesn't bring answered cards back.
function Study.saveQueue(deck_id, cards)
    local decks = Study.decks() or {}
    for _, deck in ipairs(decks) do
        if deck.id == deck_id then deck.cards = cards end
    end
    save(decks)
end

-- How many of `cards` are new, being learned and due for review.
function Study.counts(cards)
    local new, learning, review = 0, 0, 0
    for _, card in ipairs(cards) do
        if card.state == "new" then
            new = new + 1
        elseif card.state == "review" then
            review = review + 1
        else
            learning = learning + 1
        end
    end
    return new, learning, review
end

--[[
Records an answer. `on_next(next)` gets the card's new previews (what each rating
would schedule) once Lexeme has it; offline, the answer waits in the outbox.
]]
function Study.answer(card, rating, duration_ms, on_next)
    local body = {
        card_id = card.id,
        rating = rating,
        duration_ms = math.max(0, math.floor(duration_ms)),
        reviewed_at = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        review_id = Outbox.uuid(),
    }
    Outbox.push("review", body)
    waiting[body.review_id] = on_next
    if NetworkMgr:isConnected() then Background.run(sendWaiting, "study_send") end
end

return Study
