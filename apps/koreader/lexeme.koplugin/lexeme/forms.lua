-- Which conjugation of a French verb a word is, from Wiktionary's data (scripts/french_forms.py
-- builds settings/lexeme_forms.sqlite3). Without that file, nothing is shown.
local DataStorage = require("datastorage")
local Utf8Proc = require("ffi/utf8proc")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local Forms = {}

local PATH = DataStorage:getSettingsDir() .. "/lexeme_forms.sqlite3"
local QUERY = "SELECT d.text FROM forms f JOIN descriptions d ON d.id = f.description WHERE f.form = ? AND f.lemma = ?;"

local statement

local function query()
    if statement ~= nil then return statement or nil end
    statement = false
    if lfs.attributes(PATH, "mode") ~= "file" then return nil end
    local ok, prepared = pcall(function()
        return require("lua-ljsqlite3/init").open(PATH, "ro"):prepare(QUERY)
    end)
    if not ok then
        logger.warn("Lexeme: can't open", PATH, prepared)
        return nil
    end
    statement = prepared
    return statement
end

local function lookup(form, lemma)
    local stmt = query()
    if not stmt then return nil end
    local ok, row = pcall(function() return stmt:bind(form, lemma):step() end)
    local text = ok and row and row[1] or nil
    stmt:clearbind():reset()
    return text
end

-- The form as written and what it is ("présent de l'indicatif (je, il/elle)"), when
-- `word` is a conjugation of `lemma`; nil otherwise.
function Forms.describe(word, lemma)
    if not word or not lemma or word == lemma then return nil end
    local text = lookup(word, lemma)
    if text then return word, text end
    local lower = Utf8Proc.lowercase(word)
    if lower == word or lower == lemma then return nil end
    text = lookup(lower, lemma)
    if text then return lower, text end
end

return Forms
