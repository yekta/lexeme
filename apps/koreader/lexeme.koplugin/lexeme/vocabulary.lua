--[[
Every word looked up in the dictionary, as Amazon's Vocabulary Builder keeps them: each word with
the sentences it was read in, learning or mastered, and here also by language. Amazon's own list
(system/vocabulary/vocab.db, which it trims to 2,000 words) and KOReader's lookup history are
brought in, Amazon's again whenever it changes.
]]
local DataStorage = require("datastorage")
local SQ3 = require("lua-ljsqlite3/init")
local Utf8Proc = require("ffi/utf8proc")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")
local util = require("util")

local Languages = require("lexeme/languages")

local Vocabulary = {}

local PATH = DataStorage:getSettingsDir() .. "/lexeme_vocabulary.sqlite3"
-- Amazon's list, and a copy of it saved before Amazon trimmed it, if there is one.
local AMAZON_SOURCES = {
    "/mnt/us/system/vocabulary/vocab.db",
    DataStorage:getSettingsDir() .. "/lexeme_amazon_vocab.db",
}
local AMAZON_MASTERED = 100

local SCHEMA = [[
CREATE TABLE IF NOT EXISTS words (
    id TEXT PRIMARY KEY, -- language and lowercased word: "fr:réconcilier"
    word TEXT NOT NULL,
    stem TEXT, -- the dictionary's headword
    lang TEXT NOT NULL,
    mastered INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT, lang TEXT, file TEXT);
CREATE TABLE IF NOT EXISTS lookups (
    id TEXT PRIMARY KEY,
    word_id TEXT NOT NULL,
    book_id TEXT,
    usage TEXT,
    pos TEXT,
    time INTEGER NOT NULL -- milliseconds
);
CREATE INDEX IF NOT EXISTS lookups_word ON lookups(word_id);
CREATE INDEX IF NOT EXISTS lookups_book ON lookups(book_id);
-- Words deleted here, so their older lookups aren't brought back in.
CREATE TABLE IF NOT EXISTS deleted (id TEXT PRIMARY KEY, time INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS imported (source TEXT PRIMARY KEY, stamp TEXT);
]]

function Vocabulary.enabled()
    return G_reader_settings:nilOrTrue("lexeme_vocabulary_builder")
end

local function now()
    return os.time() * 1000
end

local function open()
    local conn = SQ3.open(PATH)
    conn:exec(SCHEMA)
    local created = conn:rowexec("SELECT stamp FROM imported WHERE source = 'created';")
    if not created then
        conn:exec(string.format("INSERT INTO imported VALUES ('created', '%d');", now()))
    end
    return conn
end

local function numbers(row)
    for i, v in pairs(row) do
        if type(v) == "cdata" then row[i] = tonumber(v) end
    end
    return row
end

-- Statements are prepared once per connection: the first import runs thousands.
local statements = {}

local function prepare(conn, sql)
    local stmt = statements[sql]
    if not stmt then
        stmt = conn:prepare(sql)
        statements[sql] = stmt
    end
    return stmt
end

local function finish(conn)
    for sql, stmt in pairs(statements) do
        stmt:close()
        statements[sql] = nil
    end
    conn:close()
end

local function all(conn, sql, ...)
    local stmt = prepare(conn, sql)
    stmt:bind(...)
    local list = {}
    for row in stmt:rows() do table.insert(list, numbers(row)) end
    return list
end

local function run(conn, sql, ...)
    local stmt = prepare(conn, sql)
    stmt:bind(...)
    stmt:step()
    stmt:clearbind():reset()
end

-- Runs `fn(conn)` in one transaction; a failure is logged, not raised.
local function write(fn)
    local conn = open()
    conn:exec("BEGIN;")
    local ok, result = pcall(fn, conn)
    conn:exec(ok and "COMMIT;" or "ROLLBACK;")
    finish(conn)
    if not ok then logger.warn("Lexeme: vocabulary", result) end
    return ok and result
end

local function read(fn)
    local conn = open()
    local ok, result = pcall(fn, conn)
    finish(conn)
    if not ok then logger.warn("Lexeme: vocabulary", result) end
    return ok and result or nil
end

local function lower(word)
    return Utf8Proc.lowercase(word)
end

-- A word capitalised only because it opens the sentence is shown in lowercase (but English "I"). Before it there may
-- only be spaces and punctuation (quotes and dashes are two-byte \194 or three-byte \226 sequences).
local function shownWord(word, sentence)
    local lowered = lower(word)
    if lowered == word or word == "I" or not sentence then return word end
    local at = sentence:find(word, 1, true)
    if at and not sentence:sub(1, at - 1):find("[%w\195-\225\227-\244]") then return lowered end
    return word
end

local function wordId(lang, word)
    return lang .. ":" .. lower(word)
end

-- One book per title, whichever app it was read in.
local function bookId(conn, title, authors, lang, id, file)
    title = title and util.trim(title) or ""
    if title == "" then return nil end
    local found = all(conn, "SELECT id FROM books WHERE title = ? COLLATE NOCASE LIMIT 1;", title)[1]
    if found then
        if file then run(conn, "UPDATE books SET file = ? WHERE id = ?;", file, found[1]) end
        return found[1]
    end
    run(conn, "INSERT INTO books (id, title, authors, lang, file) VALUES (?, ?, ?, ?, ?);",
        id, title, authors, lang, file)
    return id
end

-- Adds the word, or brings back to Learning one looked up again. A lowercase spelling wins over
-- one capitalised at the start of a sentence.
local function addWord(conn, lang, word, stem, mastered, relearn)
    local id = wordId(lang, word)
    local found = all(conn, "SELECT word FROM words WHERE id = ?;", id)[1]
    if not found then
        run(conn, "INSERT INTO words (id, word, stem, lang, mastered) VALUES (?, ?, ?, ?, ?);",
            id, word, stem, lang, mastered and 1 or 0)
        return id
    end
    if word == lower(word) and found[1] ~= word then
        run(conn, "UPDATE words SET word = ? WHERE id = ?;", word, id)
    end
    if stem then run(conn, "UPDATE words SET stem = ? WHERE id = ? AND stem IS NULL;", stem, id) end
    if relearn then run(conn, "UPDATE words SET mastered = 0 WHERE id = ?;", id) end
    return id
end

local function deletedAt(conn, id)
    local row = all(conn, "SELECT time FROM deleted WHERE id = ?;", id)[1]
    return row and row[1]
end

-- Recording ---------------------------------------------------------------------------------

local last_record

--[[
Keeps a dictionary lookup made while reading. `results` are the dictionary's, the shown one first;
`sentence` is the one the word was read in.
]]
local function record(ui, word, results, sentence, pos)
    word = util.trim(util.cleanupSelectedText(word or ""))
    if word == "" or word:find("%s") then return end
    local props = ui.doc_props or {}
    local lang = Languages.ofLookup(results, sentence, props.language)
    local stem
    for _, result in ipairs(results or {}) do
        if not result.no_result and Languages.ofDictionary(result.dict) == lang then
            stem = result.word
            break
        end
    end
    local file = ui.document.file
    local time = now()
    write(function(conn)
        local key = ui.doc_settings and ui.doc_settings:readSetting("partial_md5_checksum")
            or util.partialMD5(file)
        local book = bookId(conn, props.display_title, props.authors, Languages.code(props.language),
            "koreader:" .. tostring(key), file)
        local id = addWord(conn, lang, shownWord(word, sentence), stem, false, true)
        local lookup = "koreader:" .. time .. ":" .. id
        run(conn, "INSERT OR REPLACE INTO lookups (id, word_id, book_id, usage, pos, time) VALUES (?, ?, ?, ?, ?, ?);",
            lookup, id, book, sentence, type(pos) == "string" and pos or nil, time)
        last_record = { lookup = lookup, word = word, time = time }
    end)
end

function Vocabulary.record(ui, word, results, sentence, pos)
    if not (Vocabulary.enabled() and ui and ui.document) then return end
    local ok, err = pcall(record, ui, word, results, sentence, pos)
    if not ok then logger.warn("Lexeme: vocabulary", err) end
end

-- The dictionary was changed for the word just looked up: it moves to that dictionary's language.
local function relabel(word, dict_name)
    local lang = Languages.ofDictionary(dict_name)
    local last = last_record
    if not (lang and last and last.word == word) or os.time() * 1000 - last.time > 10 * 60 * 1000 then
        return
    end
    write(function(conn)
        local old = all(conn, "SELECT word_id FROM lookups WHERE id = ?;", last.lookup)[1]
        if not old or old[1] == wordId(lang, word) then return end
        local id = addWord(conn, lang, word, nil, false, true)
        run(conn, "UPDATE lookups SET word_id = ? WHERE id = ?;", id, last.lookup)
        run(conn, "DELETE FROM words WHERE id = ? AND NOT EXISTS (SELECT 1 FROM lookups WHERE word_id = ?);",
            old[1], old[1])
    end)
end

function Vocabulary.relabel(word, dict_name)
    local ok, err = pcall(relabel, word, dict_name)
    if not ok then logger.warn("Lexeme: vocabulary", err) end
end

-- Bringing in earlier lookups ---------------------------------------------------------------

local function fileStamp(path)
    local attributes = lfs.attributes(path)
    return attributes and attributes.mode == "file" and (attributes.size .. ":" .. attributes.modification) or nil
end

local function stampOf(conn, source)
    local row = all(conn, "SELECT stamp FROM imported WHERE source = ?;", source)[1]
    return row and row[1]
end

local function setStamp(conn, source, stamp)
    run(conn, "INSERT OR REPLACE INTO imported VALUES (?, ?);", source, stamp)
end

local function readAmazon(path)
    local ok, data = pcall(function()
        local conn = SQ3.open(path, "ro")
        local function rows(sql)
            local list = {}
            for row in conn:prepare(sql):rows() do table.insert(list, numbers(row)) end
            return list
        end
        local d = {
            words = rows("SELECT id, word, stem, lang, category FROM WORDS;"),
            lookups = rows("SELECT id, word_key, book_key, usage, timestamp FROM LOOKUPS;"),
            books = rows("SELECT id, title, authors, lang FROM BOOK_INFO;"),
        }
        conn:close()
        return d
    end)
    if not ok then logger.warn("Lexeme: can't read", path, data) end
    return ok and data or nil
end

local function importAmazon(conn, data)
    local words, books = {}, {}
    for _, row in ipairs(data.words) do words[row[1]] = row end
    for _, row in ipairs(data.books) do books[row[1]] = row end
    local book_ids = {}
    for _, lookup in ipairs(data.lookups) do
        local word = words[lookup[2]]
        local time = tonumber(lookup[5]) or 0
        if word and word[2] and word[2] ~= "" then
            local lang = Languages.code(word[4]) or "und"
            local id = wordId(lang, word[2])
            local deleted = deletedAt(conn, id)
            if not deleted or time > deleted then
                local book_key = lookup[3]
                if book_key and book_ids[book_key] == nil then
                    local book = books[book_key]
                    book_ids[book_key] = book and bookId(conn, book[2], book[3], Languages.code(book[4]),
                        "amazon:" .. book_key) or false
                end
                addWord(conn, lang, shownWord(word[2], lookup[4]), word[3], word[5] == AMAZON_MASTERED, false)
                run(conn, "INSERT OR IGNORE INTO lookups (id, word_id, book_id, usage, time) VALUES (?, ?, ?, ?, ?);",
                    "amazon:" .. lookup[1], id, book_key and book_ids[book_key] or nil, lookup[4], time)
            end
        end
    end
end

-- KOReader's metadata for a title: its language and authors.
local function koreaderBook(title)
    local path = DataStorage:getSettingsDir() .. "/bookinfo_cache.sqlite3"
    if not title or lfs.attributes(path, "mode") ~= "file" then return {} end
    local ok, row = pcall(function()
        local conn = SQ3.open(path, "ro")
        local stmt = conn:prepare("SELECT language, authors FROM bookinfo WHERE title = ? LIMIT 1;")
        local found = stmt:bind(title):step()
        stmt:close()
        conn:close()
        return found
    end)
    return ok and row and { language = row[1], authors = row[2] } or {}
end

-- KOReader's lookups from before this list existed, with the sentences its Vocabulary Builder kept.
local function importKOReader(conn, before)
    local titles = setmetatable({}, { __index = function(_, title) return title end })
    local books = {}
    for _, lookup in ipairs(require("lexeme/reading").lookups(0, titles)) do
        if lookup.looked_up_at < before and lookup.word and not lookup.word:find("%s") then
            local title = lookup.book_key
            if title and not books[title] then books[title] = koreaderBook(title) end
            local book = title and books[title] or {}
            local lang = Languages.ofLookup(nil, lookup.context, book.language)
            local id = wordId(lang, lookup.word)
            local deleted = deletedAt(conn, id)
            if not deleted or lookup.looked_up_at > deleted then
                local book_id = title and bookId(conn, title, book.authors, Languages.code(book.language),
                    "koreader-title:" .. title)
                addWord(conn, lang, shownWord(lookup.word, lookup.context), lookup.headword, false, false)
                run(conn, "INSERT OR IGNORE INTO lookups (id, word_id, book_id, usage, time) VALUES (?, ?, ?, ?, ?);",
                    "koreader-history:" .. lookup.id, id, book_id, lookup.context, lookup.looked_up_at)
            end
        end
    end
end

-- Brings in what's new from Amazon's list and, once, KOReader's history. Quick when nothing changed.
function Vocabulary.import()
    write(function(conn)
        for _, path in ipairs(AMAZON_SOURCES) do
            local stamp = fileStamp(path)
            if stamp and stampOf(conn, path) ~= stamp then
                local data = readAmazon(path)
                if data then
                    importAmazon(conn, data)
                    setStamp(conn, path, stamp)
                end
            end
        end
        if not stampOf(conn, "koreader") then
            importKOReader(conn, tonumber(stampOf(conn, "created")) or now())
            setStamp(conn, "koreader", tostring(now()))
        end
    end)
end

-- Lists -------------------------------------------------------------------------------------

-- Accents and case left out, so "école" sorts with "ecole".
local FOLDS = {
    ["à"] = "a", ["â"] = "a", ["ä"] = "a", ["á"] = "a", ["ã"] = "a", ["å"] = "a", ["æ"] = "ae",
    ["ç"] = "c", ["é"] = "e", ["è"] = "e", ["ê"] = "e", ["ë"] = "e", ["î"] = "i", ["ï"] = "i",
    ["í"] = "i", ["ì"] = "i", ["ı"] = "i", ["ñ"] = "n", ["ô"] = "o", ["ö"] = "o", ["ó"] = "o",
    ["ò"] = "o", ["õ"] = "o", ["ø"] = "o", ["œ"] = "oe", ["ù"] = "u", ["û"] = "u", ["ü"] = "u",
    ["ú"] = "u", ["ÿ"] = "y", ["ş"] = "s", ["ğ"] = "g", ["ß"] = "ss",
}

local function sortKey(text)
    return (lower(text or ""):gsub("[\195-\197][\128-\191]", FOLDS))
end

Vocabulary.SORTS = {
    { key = "newest", label = "Newest First" },
    { key = "oldest", label = "Oldest First" },
    { key = "az", label = "A to Z" },
    { key = "za", label = "Z to A" },
    { key = "most", label = "Most Looked Up" },
}

-- Sorts rows by `name` (the column for A to Z), `last` and `count`.
local function sortRows(rows, sort, name, count)
    local keys = {}
    for _, row in ipairs(rows) do keys[row] = sortKey(row[name]) end
    local order = {
        newest = function(a, b) return a.last > b.last end,
        oldest = function(a, b) return a.last < b.last end,
        az = function(a, b) return keys[a] < keys[b] end,
        za = function(a, b) return keys[a] > keys[b] end,
        most = function(a, b)
            if a[count] ~= b[count] then return a[count] > b[count] end
            return a.last > b.last
        end,
    }
    table.sort(rows, order[sort] or order.newest)
    return rows
end

-- Each language with words, the most words first: { code, count }.
function Vocabulary.languages()
    local rows = read(function(conn)
        return all(conn, [[SELECT w.lang, COUNT(*) FROM words w
            WHERE EXISTS (SELECT 1 FROM lookups l WHERE l.word_id = w.id) GROUP BY w.lang;]])
    end) or {}
    local list = {}
    for _, row in ipairs(rows) do table.insert(list, { code = row[1], count = row[2] }) end
    table.sort(list, function(a, b) return a.count > b.count end)
    return list
end

local function filters(lang, book)
    return lang or "", lang or "", book or "", book or ""
end

local function lang_or(opts)
    return opts.lang or ""
end

-- How many words are Learning and how many Mastered, in `lang` (nil: all) and `book` (nil: any).
function Vocabulary.counts(lang, book)
    local rows = read(function(conn)
        return all(conn, [[SELECT w.mastered, COUNT(DISTINCT w.id) FROM words w JOIN lookups l ON l.word_id = w.id
            WHERE (? = '' OR w.lang = ?) AND (? = '' OR l.book_id = ?) GROUP BY w.mastered;]], filters(lang, book))
    end) or {}
    local counts = { learning = 0, mastered = 0 }
    for _, row in ipairs(rows) do
        counts[row[1] == 1 and "mastered" or "learning"] = row[2]
    end
    return counts
end

-- The words for the grid: { id, word, stem, lang, mastered, last, count }.
function Vocabulary.words(opts)
    local rows = read(function(conn)
        return all(conn, [[SELECT w.id, w.word, w.stem, w.lang, w.mastered, MAX(l.time), COUNT(l.id)
            FROM words w JOIN lookups l ON l.word_id = w.id
            WHERE (? = '' OR w.lang = ?) AND (? = '' OR l.book_id = ?) AND w.mastered = ?
            GROUP BY w.id;]], lang_or(opts), lang_or(opts), opts.book or "", opts.book or "", opts.mastered and 1 or 0)
    end) or {}
    local list = {}
    for _, row in ipairs(rows) do
        table.insert(list, { id = row[1], word = row[2], stem = row[3], lang = row[4], mastered = row[5] == 1,
            last = row[6] or 0, count = row[7] or 0 })
    end
    return sortRows(list, opts.sort, "word", "count")
end

-- The books with words, in `lang`: { id, title, authors, count, last }.
function Vocabulary.books(opts)
    local rows = read(function(conn)
        return all(conn, [[SELECT b.id, b.title, b.authors, COUNT(DISTINCT w.id), MAX(l.time)
            FROM books b JOIN lookups l ON l.book_id = b.id JOIN words w ON w.id = l.word_id
            WHERE (? = '' OR w.lang = ?) GROUP BY b.id;]], lang_or(opts), lang_or(opts))
    end) or {}
    local list = {}
    for _, row in ipairs(rows) do
        table.insert(list, { id = row[1], title = row[2], authors = row[3], count = row[4] or 0, last = row[5] or 0 })
    end
    return sortRows(list, opts.sort, "title", "count")
end

-- Where a word was read, newest first, each sentence once: { usage, title, authors, time, pos, file }.
function Vocabulary.usages(id)
    local rows = read(function(conn)
        return all(conn, [[SELECT l.usage, b.title, b.authors, l.time, l.pos, b.file
            FROM lookups l LEFT JOIN books b ON b.id = l.book_id WHERE l.word_id = ? ORDER BY l.time DESC;]], id)
    end) or {}
    local list, seen = {}, {}
    for _, row in ipairs(rows) do
        local usage = row[1] and util.trim(row[1]) or ""
        local key = usage ~= "" and usage or tostring(row[4])
        if not seen[key] then
            seen[key] = true
            table.insert(list, { usage = usage, title = row[2], authors = row[3], time = row[4], pos = row[5],
                file = row[6] })
        end
    end
    return list
end

function Vocabulary.setMastered(id, mastered)
    write(function(conn) run(conn, "UPDATE words SET mastered = ? WHERE id = ?;", mastered and 1 or 0, id) end)
end

function Vocabulary.delete(id)
    write(function(conn)
        run(conn, "DELETE FROM lookups WHERE word_id = ?;", id)
        run(conn, "DELETE FROM words WHERE id = ?;", id)
        run(conn, "INSERT OR REPLACE INTO deleted VALUES (?, ?);", id, now())
    end)
end

return Vocabulary
