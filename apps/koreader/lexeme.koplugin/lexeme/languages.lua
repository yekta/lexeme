--[[
Which language a word was read in: from the dictionaries that know it, the sentence around
it and the book's own language.
]]
local DataStorage = require("datastorage")
local Utf8Proc = require("ffi/utf8proc")
local lfs = require("libs/libkoreader-lfs")

local Languages = {}

local NAMES = {
    ar = "Arabic", ca = "Catalan", cs = "Czech", da = "Danish", de = "German", el = "Greek",
    en = "English", eo = "Esperanto", es = "Spanish", fa = "Persian", fi = "Finnish", fr = "French",
    he = "Hebrew", hi = "Hindi", hu = "Hungarian", id = "Indonesian", it = "Italian", ja = "Japanese",
    ko = "Korean", la = "Latin", nl = "Dutch", no = "Norwegian", pl = "Polish", pt = "Portuguese",
    ro = "Romanian", ru = "Russian", sv = "Swedish", tr = "Turkish", uk = "Ukrainian", vi = "Vietnamese",
    zh = "Chinese",
}
local THREE_LETTER = {
    ara = "ar", deu = "de", ger = "de", eng = "en", spa = "es", fra = "fr", fre = "fr", ita = "it",
    jpn = "ja", nld = "nl", dut = "nl", por = "pt", rus = "ru", tur = "tr", zho = "zh", chi = "zh",
}

-- The common little words of each language, which give a sentence's language away.
local COMMON = {
    en = "the and of to a in is was that it he she his her with for on as but not you at had be have this "
        .. "they i my me from by were are said would there what their which",
    fr = "le la les l de des du d et un une il elle est que qu qui en dans pour pas ne n sur au aux se s sa "
        .. "son ses avec ce c cette mais je j tu nous vous ils elles à était plus comme lui y où ou leur",
    it = "il lo gli di del della dei che e è un una per non con si da al alla sono era ma come anche "
        .. "questo questa mi ti ci ho ha nel nella",
    es = "el los las de del que y en un una es no se por con para su al lo como más pero era fue está "
        .. "le les sus muy",
    de = "der die das und ist nicht ein eine zu den dem mit sich auf für von es ich sie er war auch als wie "
        .. "aber noch im ins",
    tr = "ve bir bu da de ile için ne o şu gibi çok daha kadar ama ben sen biz onu bunu değil var yok mi "
        .. "mı ki diye",
    pt = "o a os as de do da dos das que e um uma em no na não se por com para mas como mais foi era ele "
        .. "ela",
    nl = "de het een en van is dat op te in niet zijn met voor hij ze er maar ook als",
}
local common = {}
for code, words in pairs(COMMON) do
    common[code] = {}
    for word in words:gmatch("%S+") do common[code][word] = true end
end

-- "fr" for "fr-CA", "fra" or "French"; nil when it can't tell.
function Languages.code(language)
    if type(language) ~= "string" or language == "" then return nil end
    local lower = language:lower()
    local code = lower:match("^(%a%a%a?)[-_]") or lower:match("^(%a%a%a?)$")
    if code and #code == 3 then code = THREE_LETTER[code] end
    if code and NAMES[code] then return code end
    for c, name in pairs(NAMES) do
        if name:lower() == lower then return c end
    end
end

function Languages.name(code)
    return NAMES[code] or (code and code ~= "" and code ~= "und" and code:upper()) or "Other"
end

-- Punctuation outside ASCII, replaced whole: a character class would match the bytes of letters.
local PUNCTUATION = { "’", "‘", "«", "»", "“", "”", "„", "…", "–", "—" }

local function words(text)
    local list = {}
    text = Utf8Proc.lowercase(text)
    for _, mark in ipairs(PUNCTUATION) do text = text:gsub(mark, " ") end
    for word in text:gmatch("[^%s%p%d]+") do table.insert(list, word) end
    return list
end

-- The language a sentence is in, and whether that's clear (several common words, well ahead of
-- any other language).
function Languages.detect(text)
    if not text or text == "" then return nil, false end
    local counts = {}
    for _, word in ipairs(words(text)) do
        for code, set in pairs(common) do
            if set[word] then counts[code] = (counts[code] or 0) + 1 end
        end
    end
    local best, best_n, second_n = nil, 0, 0
    for code, n in pairs(counts) do
        if n > best_n then
            best, best_n, second_n = code, n, best_n
        elseif n > second_n then
            second_n = n
        end
    end
    return best, best_n >= 3 and best_n >= second_n * 1.5
end

-- What the .ifo files say of each dictionary: its language (a lang= line, a name like fr-en.ifo,
-- or a title like "Wiktionary French-English"), its file and whether it's HTML.
local dictionaries

local function readIfos(dir, found)
    if lfs.attributes(dir, "mode") ~= "directory" then return end
    for name in lfs.dir(dir) do
        local path = dir .. "/" .. name
        if name ~= "." and name ~= ".." and name ~= "res" then
            if lfs.attributes(path, "mode") == "directory" then
                readIfos(path, found)
            elseif name:match("%.ifo$") then
                local f = io.open(path, "r")
                local content = f and f:read("*all") or ""
                if f then f:close() end
                local title = content:match("\nbookname=(.-)\r?\n")
                if title then
                    local code = Languages.code(content:match("\nlang=(%a+)") or "")
                        or Languages.code(name:match("^(%a%a%a?)[-_]%a%a%a?%.ifo$") or "")
                    if not code then
                        for part in title:gmatch("%a+") do
                            code = code or Languages.code(part)
                        end
                    end
                    local is_html = content:find("sametypesequence=h", 1, true) ~= nil
                    found[title] = { lang = code, file = path, is_html = is_html }
                end
            end
        end
    end
end

function Languages.dictionary(name)
    if not dictionaries then
        dictionaries = {}
        local dir = DataStorage:getDataDir() .. "/data/dict"
        readIfos(dir, dictionaries)
        readIfos(dir .. "_ext", dictionaries)
    end
    return name and dictionaries[name]
end

function Languages.ofDictionary(name)
    local dictionary = Languages.dictionary(name)
    return dictionary and dictionary.lang
end

-- The dictionaries of a language, in `names`' order.
function Languages.dictionaries(code, names)
    local list = {}
    for _, name in ipairs(names or {}) do
        if Languages.ofDictionary(name) == code then table.insert(list, name) end
    end
    return list
end

--[[
The language a looked-up word is in. `results` are the dictionary's; the first is the one shown.
One dictionary language settles it; between several, the sentence decides when it's clear, then
the dictionary shown. Without a dictionary entry, the sentence, then the book.
]]
function Languages.ofLookup(results, sentence, book_language)
    local candidates, shown = {}, nil
    for _, result in ipairs(results or {}) do
        local code = not result.no_result and Languages.ofDictionary(result.dict)
        if code then
            candidates[code] = true
            shown = shown or code
        end
    end
    local detected, clear = Languages.detect(sentence)
    local count, only = 0, nil
    for code in pairs(candidates) do
        count, only = count + 1, code
    end
    if count == 1 then return only end
    if count > 1 then
        if detected and clear and candidates[detected] then return detected end
        return shown
    end
    if detected and clear then return detected end
    return Languages.code(book_language) or detected or "und"
end

return Languages
