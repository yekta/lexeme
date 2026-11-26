--[[
The dictionary sheet's Translate tab: the selection translated by KOReader's translation
service, laid out like a dictionary entry. Besides the translation it keeps what KOReader's
detailed view shows (alternatives, the source word's definitions) and adds the service's
per-sense translations and usage examples.
]]
local Translator = require("ui/translator")
local util = require("util")

local Translation = {}

local AUTODETECT = "auto"
-- t: translation, at: alternatives, bd: translations by sense, md: definitions, ex: examples.
local DETAILS = { "t", "at", "bd", "md", "ex" }
local MAX_SENSES, MAX_BACK, MAX_ALSO, MAX_DEFINITIONS, MAX_EXAMPLES = 8, 4, 8, 8, 5

local function str(v)
    return type(v) == "string" and v ~= "" and v or nil
end

-- The values of a decoded JSON array, which has holes where it had nulls.
local function items(v)
    local out = {}
    if type(v) ~= "table" then return out end
    for i = 1, table.maxn(v) do
        if v[i] ~= nil then table.insert(out, v[i]) end
    end
    return out
end

-- Every string in a nested label list, such as { nil, nil, nil, nil, { "(familier)" } }.
local function strings(v, out)
    out = out or {}
    if type(v) == "string" then
        table.insert(out, v)
    elseif type(v) == "table" then
        for _, x in ipairs(items(v)) do strings(x, out) end
    end
    return out
end

-- The book's language when it differs from the target; a single word is often misdetected.
function Translation.languages()
    local target = Translator:getTargetLanguage()
    local source = Translator:getSourceLanguage()
    if source == AUTODETECT then
        local book = Translator:getDocumentLanguage()
        if book and book ~= target then source = book end
    end
    return source, target
end

function Translation.languageName(lang)
    return Translator:getLanguageName(lang, lang or "")
end

-- The service's answer reduced to plain fields.
local function digest(result)
    local out = { source = str(result[3]), alternates = {}, senses = {}, definitions = {}, examples = {} }
    local parts = {}
    for _, segment in ipairs(items(result[1])) do
        if type(segment) == "table" then
            if str(segment[1]) then
                table.insert(parts, segment[1])
            elseif str(segment[3]) then
                out.romanized = segment[3]
            end
        end
    end
    out.translation = table.concat(parts, "")

    -- Alternatives only make sense for a text the service took as one piece.
    local alternates = items(result[6])
    if #alternates == 1 and type(alternates[1]) == "table" then
        for _, alt in ipairs(items(alternates[1][3])) do
            local text = type(alt) == "table" and str(alt[1])
            if text and text ~= out.translation then table.insert(out.alternates, text) end
        end
    end

    for _, entry in ipairs(items(result[2])) do
        if type(entry) == "table" then
            local sense = { pos = str(entry[1]), terms = {}, also = {} }
            local shown = {}
            for _, term in ipairs(items(entry[3])) do
                if #sense.terms >= MAX_SENSES then break end
                if type(term) == "table" and str(term[1]) then
                    local back = {}
                    for _, b in ipairs(items(term[2])) do
                        if #back < MAX_BACK and str(b) then table.insert(back, b) end
                    end
                    table.insert(sense.terms, { term = term[1], back = back })
                    shown[term[1]] = true
                end
            end
            for _, term in ipairs(items(entry[2])) do
                if #sense.also >= MAX_ALSO then break end
                if str(term) and not shown[term] then table.insert(sense.also, term) end
            end
            if #sense.terms > 0 then table.insert(out.senses, sense) end
        end
    end

    for _, entry in ipairs(items(result[13])) do
        if type(entry) == "table" then
            local group = { pos = str(entry[1]), base = str(entry[3]), items = {} }
            for _, d in ipairs(items(entry[2])) do
                if #group.items >= MAX_DEFINITIONS then break end
                if type(d) == "table" and str(d[1]) then
                    local labels = strings(d[4])
                    for k, label in ipairs(labels) do
                        if not label:find("^%(") then labels[k] = "(" .. label .. ")" end
                    end
                    table.insert(group.items, { text = d[1], example = str(d[3]), labels = labels })
                end
            end
            if #group.items > 0 then table.insert(out.definitions, group) end
        end
    end

    local examples = items(result[14])
    for _, ex in ipairs(items(examples[1])) do
        if #out.examples >= MAX_EXAMPLES then break end
        if type(ex) == "table" and str(ex[1]) then table.insert(out.examples, ex[1]) end
    end
    return out
end

--[[
Asks the service; meant to run in a subprocess. Returns the digest, or { error = reason }.
KOReader's own translator object is left untouched: this asks for more details than it does.
]]
function Translation.fetch(text, source, target)
    local translator = setmetatable({ trans_params = util.tableDeepCopy(Translator.trans_params) },
        { __index = Translator })
    translator.trans_params.dt = DETAILS
    local ok, result = pcall(translator.loadPage, translator, text, target, source)
    if not ok then return { error = "offline" } end
    if type(result) ~= "table" then return { error = "failed" } end
    local d = digest(result)
    if d.translation == "" then return { error = "failed" } end
    return d
end

-- Layout ----------------------------------------------------------------------------------
-- The tab is drawn with Lexeme's own text drawing, as the rest of the interface is: MuPDF, which
-- draws the dictionary's HTML, can't load fonts from memory with the Kindle's FreeType, so it
-- falls back to whatever face it has and sometimes fails outright.

local BODY = 30

local function capitalized(s)
    return s and (s:gsub("^%l", string.upper)) or s
end

-- `style` is nil, "gray", or "hidden" (takes room without being drawn).
local function run(kind, text, style, em)
    return { kind = kind, text = text, style = style, em = em or BODY }
end

-- Google's examples mark the word with <b>; that becomes bold, other markup is dropped.
local function exampleRuns(html)
    local runs = { run("regular", "•  ") }
    local text = util.htmlEntitiesToUtf8((html:gsub("<[^b/][^>]*>", ""):gsub("</[^b][^>]*>", "")))
    local pos = 1
    while pos <= #text do
        local s, e, bold = text:find("<b>(.-)</b>", pos)
        if not s then
            table.insert(runs, run("regular", text:sub(pos)))
            break
        end
        if s > pos then table.insert(runs, run("regular", text:sub(pos, s - 1))) end
        table.insert(runs, run("bold", bold))
        pos = e + 1
    end
    return runs
end

--[[
The entry as paragraphs: { runs, indent, hang, gap, heading } or { rule = true, gap }. A `hang`
paragraph wraps under its second run, after its number or bullet; a heading stays with what follows.
]]
function Translation.paragraphs(d, source, target)
    local out = {}
    local function add(runs, opts)
        opts = opts or {}
        table.insert(out, { runs = runs, indent = opts.indent or 0, hang = opts.hang, gap = opts.gap or 0,
            heading = opts.heading })
    end
    local lang = d.source or source
    local from = lang == AUTODETECT and "Detected language" or Translation.languageName(lang)
    add({ run("regular", from .. " → " .. Translation.languageName(target), "gray", 26) })
    -- A word or short phrase stands out like a headword; a sentence reads as text.
    local words = select(2, d.translation:gsub("%S+", ""))
    if words <= 4 then
        add({ run("bold", d.translation, nil, 36) }, { gap = 6 })
    else
        add({ run("regular", d.translation, nil, 36) }, { gap = 8 })
    end
    if d.romanized then add({ run("regular", d.romanized, "gray") }) end
    if #d.alternates > 0 then
        add({ run("italic", "Also: "), run("regular", table.concat(d.alternates, ", ")) }, { gap = 6 })
    end

    for _, sense in ipairs(d.senses) do
        add({ run("bold", capitalized(sense.pos or "")) }, { gap = 22, heading = true })
        for i, t in ipairs(sense.terms) do
            local runs = { run("regular", i .. ".  "), run("bold", t.term) }
            if #t.back > 0 then table.insert(runs, run("regular", " " .. table.concat(t.back, ", "), "gray")) end
            add(runs, { indent = 6, hang = true, gap = 2 })
        end
        if #sense.also > 0 then
            add({ run("italic", "Also: "), run("regular", table.concat(sense.also, ", ")) }, { gap = 8 })
        end
    end

    if #d.definitions > 0 then
        table.insert(out, { rule = true, gap = 24 })
        add({ run("bold", "Definitions", nil, 32) }, { gap = 6, heading = true })
        for _, group in ipairs(d.definitions) do
            local heading = capitalized(group.pos or "")
            if group.base then heading = heading .. " · " .. group.base end
            add({ run("bold", heading) }, { gap = 14, heading = true })
            for i, item in ipairs(group.items) do
                local runs = { run("regular", i .. ".  ") }
                if #item.labels > 0 then table.insert(runs, run("italic", table.concat(item.labels, ", ") .. " ")) end
                table.insert(runs, run("regular", item.text))
                add(runs, { indent = 6, hang = true, gap = 4 })
                if item.example then
                    add({ run("regular", i .. ".  ", "hidden"), run("italic", item.example, "gray") },
                        { indent = 6, hang = true })
                end
            end
        end
    end

    if #d.examples > 0 then
        table.insert(out, { rule = true, gap = 24 })
        add({ run("bold", "Examples", nil, 32) }, { gap = 6, heading = true })
        for _, ex in ipairs(d.examples) do add(exampleRuns(ex), { indent = 6, hang = true, gap = 6 }) end
    end
    return out
end

--[[
The paragraphs wrapped to `width` and cut into pages `height` tall. A page is a list of lines
{ y, h, words = { { x, face, text, style } } } or { y, h, rule = true }, from the content's top left.
]]
function Translation.pages(paragraphs, width, height)
    local D = require("lexeme/draw")
    local function lineHeight(em) return D.s(math.floor(em * 1.4 + 0.5)) end
    local pages, page, y = {}, {}, 0
    local function newPage()
        table.insert(pages, page)
        page, y = {}, 0
    end
    local function place(line, h)
        if y + h > height and #page > 0 then newPage() end
        line.y, line.h = y, h
        table.insert(page, line)
        y = y + h
    end
    for _, p in ipairs(paragraphs) do
        if y > 0 then y = y + D.s(p.gap) end
        -- A rule or heading with no room for a line after it goes to the next page; the rule is
        -- left out there, as the page's top edge already separates.
        local room_after = D.s(16) + lineHeight(BODY) * (p.rule and 3 or 2)
        if (p.rule or p.heading) and #page > 0 and y + room_after > height then newPage() end
        if p.rule then
            if #page > 0 then place({ rule = true }, D.s(16)) end
        else
            local start = D.s(p.indent)
            local x, wrap_x, pending = start, start, false
            local line = { words = {}, h = 0 }
            local lines = { line }
            for i, r in ipairs(p.runs) do
                local face = D.face(r.kind, r.em)
                local space = D.width(face, " ")
                line.h = math.max(line.h, lineHeight(r.em))
                for lead, word in r.text:gmatch("(%s*)(%S+)") do
                    local w = D.width(face, word)
                    local gap = ((lead ~= "" or pending) and #line.words > 0) and space or 0
                    pending = false
                    if x + gap + w > width and #line.words > 0 then
                        line = { words = {}, h = lineHeight(r.em) }
                        table.insert(lines, line)
                        x, gap = wrap_x, 0
                    end
                    table.insert(line.words, { x = x + gap, face = face, style = r.style,
                        text = D.fit(face, word, width - x - gap) })
                    x = x + gap + w
                end
                if r.text:find("%s$") then pending = true end
                if i == 1 and p.hang then wrap_x = x + (pending and space or 0) end
            end
            for _, l in ipairs(lines) do place(l, l.h) end
        end
    end
    table.insert(pages, page)
    return pages
end

-- Target languages offered in the sheet's menu.
Translation.TARGETS = { "en", "tr", "fr", "de", "es", "it" }

return Translation
