-- Words added to Lexeme from the reader. They wait in the outbox until sent.
local Outbox = require("lexeme/outbox")

local Words = {}

function Words.pending()
    local words = {}
    for _, entry in ipairs(Outbox.entries()) do
        if entry.kind == "word" then table.insert(words, entry.body) end
    end
    return words
end

-- Queues the word as a card; false when the same word is already waiting.
function Words.add(entry)
    for _, waiting in ipairs(Words.pending()) do
        if waiting.word:lower() == entry.word:lower() then return false end
    end
    local body = {
        word = entry.word,
        context = entry.context,
        deck_id = G_reader_settings:readSetting("lexeme_deck_id"),
    }
    Outbox.push("word", body)
    return true
end

local function trim(text)
    return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

local CLOSERS = { '"', "'", ")", "”", "’", "»" }

local function endsSentence(token)
    local stripped = true
    while stripped do
        stripped = false
        for _, closer in ipairs(CLOSERS) do
            if #token > #closer and token:sub(-#closer) == closer then
                token = token:sub(1, -#closer - 1)
                stripped = true
            end
        end
    end
    return token:find("[%.%?!]$") ~= nil or token:sub(-3) == "…"
end

-- Cuts the words around a selection down to the sentence that contains it.
function Words.sentence(before, word, after)
    local head = {}
    for token in (before or ""):gmatch("%S+") do table.insert(head, token) end
    local first = 1
    for i = #head, 1, -1 do
        if endsSentence(head[i]) then
            first = i + 1
            break
        end
    end
    local tail = {}
    for token in (after or ""):gmatch("%S+") do
        table.insert(tail, token)
        if endsSentence(token) then break end
    end
    local prefix = table.concat(head, " ", first)
    local suffix = table.concat(tail, " ")
    local glued = after and not after:find("^%s")
    return trim((prefix ~= "" and prefix .. " " or "") .. word .. (glued and "" or " ") .. suffix)
end

-- The selection's word with the sentence around it.
function Words.fromSelection(ui)
    local selected = ui.highlight.selected_text
    if not selected or not selected.text then return end
    local entry = { word = trim(selected.text) }
    local before, after = ui.highlight:getSelectedWordContext(30)
    if before or after then
        entry.context = Words.sentence(before, selected.text, after)
    end
    return entry
end

return Words
