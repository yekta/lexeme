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
        deck_id = G_reader_settings:readSetting("lexeme_deck_id"),
    }
    Outbox.push("word", body)
    return true
end

local function trim(text)
    return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- The selection's word.
function Words.fromSelection(ui)
    local selected = ui.highlight.selected_text
    if not selected or not selected.text then return end
    return { word = trim(selected.text) }
end

return Words
