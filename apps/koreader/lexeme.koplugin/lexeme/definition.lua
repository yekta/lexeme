--[[
A dictionary entry as a Kindle dictionary shows it: the headword with its pronunciation,
then the senses. Wiktionary's entries are trimmed to that: no regional pronunciations,
inflections line, attestation dates, synonym lines, obsolete senses, grammar labels, or
sections other than the parts of speech.
]]
local util = require("util")

local Definition = {}

local PARTS_OF_SPEECH = {
    Noun = true, ["Proper noun"] = true, Verb = true, Adjective = true, Adverb = true, Pronoun = true,
    Preposition = true, Conjunction = true, Interjection = true, Determiner = true, Article = true,
    Numeral = true, Particle = true, Prefix = true, Suffix = true, Phrase = true,
    ["Prepositional phrase"] = true, Proverb = true, Contraction = true, Abbreviation = true,
    Initialism = true, Acronym = true, Symbol = true, Letter = true,
}
local GRAMMAR_LABELS = {
    transitive = true, intransitive = true, ambitransitive = true, countable = true, uncountable = true,
    ["countable and uncountable"] = true, ["usually uncountable"] = true, ["usually countable"] = true,
}
local DROPPED_LABELS = { obsolete = true, archaic = true }
local LABEL = '<span class="usage%-label%-sense">(.-%))</span></span>'

local function labelWords(label)
    local text = label:gsub("<[^>]+>", ""):gsub("^%s*%(", ""):gsub("%)%s*$", "")
    local words = {}
    for part in text:gmatch("[^,]+") do
        local word = part:gsub("^%s+", ""):gsub("%s+$", "")
        if word ~= "" then table.insert(words, word) end
    end
    return words
end

local function isDropped(label)
    for _, word in ipairs(labelWords(label)) do
        if DROPPED_LABELS[word] then return true end
    end
    return false
end

-- Where the <li> opened at `start` closes, counting the senses nested in it.
local function closingLi(html, start)
    local depth, pos = 0, start
    while true do
        local a, b, slash = html:find("<(/?)li[%s>]", pos)
        if not a then return #html end
        depth = depth + (slash == "" and 1 or -1)
        if depth == 0 then return html:find(">", a, true) end
        pos = b + 1
    end
end

local function withoutDroppedSenses(html)
    local out, pos = {}, 1
    while true do
        local start = html:find("<li>", pos, true)
        if not start then break end
        local label = html:match("^" .. LABEL, start + 4)
        table.insert(out, html:sub(pos, start - 1))
        if label and isDropped(label) then
            pos = closingLi(html, start) + 1
        else
            table.insert(out, "<li>")
            pos = start + 4
        end
    end
    table.insert(out, html:sub(pos))
    return table.concat(out)
end

local function withoutGrammarLabels(html)
    return (html:gsub(LABEL, function(label)
        local kept = {}
        for _, word in ipairs(labelWords(label)) do
            if not GRAMMAR_LABELS[word] then table.insert(kept, word) end
        end
        if #kept == 0 then return "" end
        return '<span class="lexeme-label">(' .. util.htmlEscape(table.concat(kept, ", ")) .. ")</span>"
    end))
end

local function partsOfSpeech(html)
    local first = html:find("<h4>", 1, true)
    if not first then return html end
    local out = { html:sub(1, first - 1) }
    local pos = first
    while pos do
        local heading = html:match("^<h4>(.-)</h4>", pos)
        local next_pos = html:find("<h4>", pos + 4, true)
        if heading and PARTS_OF_SPEECH[heading] then
            table.insert(out, html:sub(pos, (next_pos or #html + 1) - 1))
        end
        pos = next_pos
    end
    return table.concat(out)
end

local function trimWiktionary(body)
    local ipa
    body = body:gsub("<ul>(.-)</ul>", function(list)
        if not list:find("IPA") then return nil end
        ipa = ipa or list:match('<span class="IPA[^"]*">(.-)</span>')
        return ""
    end)
    body = body:gsub('<p><span class="headword%-line">.-</p>', "")
    body = body:gsub("<style>.-</style>", ""):gsub('<span class="defdate">.-</span>', "")
    body = body:gsub('<dd><span class="nyms[^"]*">.-</dd>', ""):gsub("<dl></dl>", "")
    body = body:gsub("</section>%s*$", "")
    body = withoutGrammarLabels(withoutDroppedSenses(partsOfSpeech(body)))
    return body, ipa
end

function Definition.html(result)
    local body = result.definition or ""
    local ipa
    if result.is_html then
        body, ipa = trimWiktionary(body)
    else
        body = util.htmlEscape(body):gsub("\n", "<br/>")
    end
    local pronunciation = ipa and (' <span class="lexeme-ipa">' .. ipa .. "</span>") or ""
    return '<div class="lexeme-hw">' .. util.htmlEscape(result.word or "") .. pronunciation .. "</div>" .. body
end

-- "oblique is a form of obliquer: présent de l'indicatif et du subjonctif (je, il/elle); impératif (tu).",
-- or "".
local function formLine(word, headword)
    local form, text = require("lexeme/forms").describe(word, headword)
    if not form then return "" end
    return string.format('<div class="lexeme-form"><b>%s</b> is a form of <b>%s</b>: %s.</div>',
        util.htmlEscape(form), util.htmlEscape(headword), util.htmlEscape(text))
end

-- Every entry `dict` has for the word ("oblique", then the verb "obliquer"), one under the other.
function Definition.entries(word, results, dict)
    local parts = {}
    for _, result in ipairs(results) do
        if result.dict == dict then
            local html = formLine(word, result.word) .. Definition.html(result)
            table.insert(parts, #parts == 0 and html or '<div class="lexeme-entry">' .. html .. "</div>")
        end
    end
    return table.concat(parts)
end

-- The style the entries are shown in, after the dictionary's own.
Definition.CSS = [[
@page { margin: 0; font-family: 'Noto Sans'; }
body { margin: 0; line-height: 1.3; }
.lexeme-hw { font-weight: bold; font-size: 1.1em; margin-bottom: 0.2em; }
.lexeme-ipa { font-weight: normal; font-size: 0.8em; }
.lexeme-label { font-style: italic; }
.lexeme-entry { margin-top: 1em; }
.lexeme-form { margin-bottom: 0.4em; }
ol, ul { margin: 0; padding: 0 0 0 1.4em; }
blockquote, dd { margin: 0 1em; }
]]

return Definition
