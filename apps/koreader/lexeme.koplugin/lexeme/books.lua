-- The books in the home folder, with their metadata, covers and reading state.
local Blitbuffer = require("ffi/blitbuffer")
local BookList = require("ui/widget/booklist")
local Device = require("device")
local DocumentRegistry = require("document/documentregistry")
local ReadHistory = require("readhistory")
local RenderImage = require("ui/renderimage")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")
local util = require("util")

local AmazonLibrary = require("lexeme/amazon_library")

local Books = {}

-- What the library calls each file type it lists.
local KINDS = {
    epub = "books", epub3 = "books", mobi = "books", azw = "books", azw3 = "books", prc = "books",
    pdb = "books", fb2 = "books", fb3 = "books",
    cbz = "comics", cbr = "comics", cbt = "comics",
    pdf = "documents", djvu = "documents", djv = "documents", txt = "documents", rtf = "documents",
    doc = "documents", docx = "documents", odt = "documents", chm = "documents", html = "documents",
    htm = "documents", xhtml = "documents", md = "documents", xps = "documents", oxps = "documents",
}

local COVER_SPECS = { max_cover_w = 600, max_cover_h = 900 }

function Books.homeDir()
    return G_reader_settings:readSetting("home_dir") or Device.home_dir or "/mnt/us/documents"
end

-- coverbrowser's metadata store; nil when that plugin is disabled.
local function infoManager()
    local ok, manager = pcall(require, "bookinfomanager")
    return ok and manager or nil
end

local function stripExtension(file)
    return file:gsub("%.[^.]+$", "")
end

local function lastReadTimes()
    local times = {}
    for _, entry in ipairs(ReadHistory.hist) do
        times[entry.file] = entry.time
    end
    return times
end

-- Title and authors from coverbrowser's store, whose rows come with their covers; kept while
-- the file is unchanged and until the next extraction.
local metadata = {}

local function bookMetadata(path, mtime, manager)
    local known = metadata[path]
    if known and known.mtime == mtime then return known.meta end
    local meta = manager:getBookInfo(path, false)
    meta = meta and { title = meta.title, authors = meta.authors } or false
    metadata[path] = { mtime = mtime, meta = meta }
    return meta
end

local function describe(path, file, mtime, read_times, manager)
    local kind = KINDS[(file:match("%.([^.]+)$") or ""):lower()]
    local book = { path = path, title = stripExtension(file), authors = nil, added = mtime or 0, kind = kind }
    local meta = manager and bookMetadata(path, mtime, manager)
    if meta then
        if meta.title and meta.title ~= "" then book.title = meta.title end
        book.authors = meta.authors
        book.has_meta = true
    end
    local info = BookList.getBookInfo(path)
    book.opened = info.been_opened
    book.percent = info.percent_finished
    book.status = info.been_opened and (info.status or "reading") or "new"
    book.last_read = read_times[path] or 0
    -- What the Kindle's own reader did with the book: its progress until KOReader opens the
    -- book, and its last open for the "recent" order.
    local amazon = AmazonLibrary.forPath(path)
    if amazon then
        book.last_read = math.max(book.last_read, amazon.last_access)
        if not info.been_opened and (amazon.percent > 0 or amazon.read) then
            book.percent = amazon.percent
            book.status = amazon.read and "complete" or "reading"
        end
        -- A converted copy isn't a new book: it takes the original's place in "recent".
        if path:find("/Converted/", 1, true) then book.recent = book.last_read end
    end
    return book
end

function Books.forPath(path)
    local attr = lfs.attributes(path) or {}
    return describe(path, path:match("([^/]+)$"), attr.modification, lastReadTimes(), infoManager())
end

-- The book's description from its metadata, as plain text, or nil.
function Books.description(path)
    local manager = infoManager()
    local meta = manager and manager:getBookInfo(path, false)
    local html = meta and meta.description
    if not html or html == "" then return nil end
    local text = html:gsub("<[Bb][Rr]%s*/?>", "\n"):gsub("</[Pp]>", "\n\n"):gsub("<[^>]+>", "")
    text = text:gsub("&nbsp;", " "):gsub("&amp;", "&"):gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&quot;", '"')
        :gsub("&#39;", "'"):gsub("&rsquo;", "’"):gsub("&lsquo;", "‘"):gsub("&ldquo;", "“"):gsub("&rdquo;", "”")
    return (text:gsub("\n%s*\n%s*\n+", "\n\n"):gsub("^%s+", ""):gsub("%s+$", ""))
end

-- Whether a MOBI-family file (.mobi, .azw, .azw3, .prc) is locked to a Kindle: its first record's
-- encryption field isn't 0. KOReader can't open those, so the library leaves them out; an
-- unlocked copy, if there is one, lives in Converted. Kept per path while the file is unchanged.
local MOBI_KINDS = { mobi = true, azw = true, azw3 = true, prc = true }
local locked_files = {}

local function mobiLocked(path, mtime)
    local known = locked_files[path]
    if known and known.mtime == mtime then return known.locked end
    local locked = false
    local f = io.open(path, "rb")
    if f then
        local head = f:read(86)
        if head and #head == 86 and head:sub(61, 68) == "BOOKMOBI" then
            local a, b, c, d = head:byte(79, 82)
            f:seek("set", ((a * 256 + b) * 256 + c) * 256 + d)
            local record = f:read(14)
            if record and #record == 14 then
                local hi, lo = record:byte(13, 14)
                locked = hi * 256 + lo ~= 0
            end
        end
        f:close()
    end
    locked_files[path] = { mtime = mtime, locked = locked }
    return locked
end

-- Folders the library never lists from; they hold most of a Kindle's files.
local function skipsFolder(path, name)
    return name:sub(1, 1) == "." or name:find("%.sdr$") or name == "dictionaries"
        or name == "Kindle Reference" or path:find("/Downloads/Items01$")
end

-- util.findFiles, without going into the folders above.
local function findFiles(dir, callback)
    local ok, iter, dir_obj = pcall(lfs.dir, dir)
    if not ok then return end
    for name in iter, dir_obj do
        if name ~= "." and name ~= ".." then
            local path = dir .. "/" .. name
            local attr = lfs.attributes(path) or {}
            if attr.mode == "directory" then
                if not skipsFolder(path, name) then findFiles(path, callback) end
            elseif attr.mode == "file" or attr.mode == "link" then
                callback(path, name, attr)
            end
        end
    end
end

function Books.scan()
    local manager = infoManager()
    local read_times = lastReadTimes()
    local list = {}
    findFiles(Books.homeDir(), function(path, file, attr)
        -- Amazon's own downloads (Downloads/Items01) are its copies; KOReader keeps converted ones in Books.
        if file:sub(1, 1) == "." or path:find("/%.") or path:find("%.sdr/") or path:find("/dictionaries/")
            or path:find("/Kindle Reference/") or path:find("/Downloads/Items01/") then
            return
        end
        local ext = file:match("%.([^.]+)$")
        if not ext or not KINDS[ext:lower()] then return end
        if not DocumentRegistry:hasProvider(path) then return end
        if MOBI_KINDS[ext:lower()] and mobiLocked(path, attr.modification) then return end
        table.insert(list, describe(path, file, attr.modification, read_times, manager))
    end)
    return list
end

-- Each sort in ascending order: oldest, A to Z.
local SORTS = {
    recent = function(a, b)
        local ta = a.recent or math.max(a.last_read, a.added)
        local tb = b.recent or math.max(b.last_read, b.added)
        if ta ~= tb then return ta < tb end
        return a.title > b.title
    end,
    title = function(a, b) return a.title:lower() < b.title:lower() end,
    author = function(a, b)
        local aa, ab = Books.surname(a.authors):lower(), Books.surname(b.authors):lower()
        if aa ~= ab then return aa < ab end
        return a.title:lower() < b.title:lower()
    end,
    added = function(a, b) return a.added < b.added end,
}

-- "Paul Auster" -> "Auster"; books without an author sort last.
function Books.surname(authors)
    if not authors or authors == "" then return "~" end
    local first = authors:match("^[^\n,&;]+") or authors
    return first:match("(%S+)%s*$") or first
end

function Books.statusKey(book)
    if book.status == "new" then return "unread" end
    if book.status == "complete" then return "read" end
    return "in_progress"
end

-- `filters` maps a group ("status", "kind") to the set of values it lets through;
-- an empty set lets everything through.
function Books.matches(book, filters)
    for group, set in pairs(filters or {}) do
        if next(set) then
            local value = group == "status" and Books.statusKey(book) or book.kind
            if not set[value] then return false end
        end
    end
    return true
end

function Books.count(list, group, value)
    local n = 0
    for _, book in ipairs(list) do
        local v = group == "status" and Books.statusKey(book) or book.kind
        if v == value then n = n + 1 end
    end
    return n
end

function Books.query(list, filters, sort, descending)
    local result = {}
    for _, book in ipairs(list) do
        if Books.matches(book, filters) then table.insert(result, book) end
    end
    local ascending = SORTS[sort] or SORTS.recent
    table.sort(result, descending and function(a, b) return ascending(b, a) end or ascending)
    return result
end

local cover_cache = {}

-- Returns the cover scaled to fit w x h, or nil when there is none (yet).
function Books.cover(book, w, h)
    local key = book.path .. "|" .. w .. "|" .. h
    local cached = cover_cache[key]
    if cached ~= nil then return cached or nil end
    local manager = infoManager()
    local meta = manager and manager:getBookInfo(book.path, true)
    if not meta or not meta.cover_bb then
        if meta then cover_cache[key] = false end
        return nil
    end
    local cover = Books.fill(meta.cover_bb, w, h)
    cover_cache[key] = cover
    return cover
end

-- Book-shaped covers take the box's full width and their own height, as on the
-- Kindle, so a taller cover stands taller; only one taller than the box is
-- trimmed. Anything far from book-shaped (a square logo) is fitted whole.
local function isBookShaped(iw, ih, w, h)
    local ratio, box = ih / iw, h / w
    return ratio > box * 0.8 and ratio < box * 1.25
end

function Books.fill(image, w, h)
    local iw, ih = image:getWidth(), image:getHeight()
    if not isBookShaped(iw, ih, w, h) then
        local k = math.min(w / iw, h / ih)
        return RenderImage:scaleBlitBuffer(image, math.floor(iw * k + 0.5), math.floor(ih * k + 0.5), true)
    end
    local sh = math.floor(ih * w / iw + 0.5)
    local scaled = RenderImage:scaleBlitBuffer(image, w, sh, true)
    if sh <= h then return scaled end
    local cropped = Blitbuffer.new(w, h, scaled:getType())
    cropped:blitFrom(scaled, 0, 0, 0, math.floor((sh - h) / 2), w, h)
    scaled:free()
    return cropped
end

function Books.clearCovers()
    for _, bb in pairs(cover_cache) do
        if bb then bb:free() end
    end
    cover_cache = {}
end

local extracting = false
local attempted = {}

-- Extracts metadata and covers for books that have none, then calls on_done.
function Books.extractMissing(list, on_done)
    local manager = infoManager()
    if not manager or extracting then return end
    local files = {}
    for _, book in ipairs(list) do
        if not book.has_meta and not attempted[book.path] then
            attempted[book.path] = true
            table.insert(files, { filepath = book.path, cover_specs = COVER_SPECS })
        end
    end
    if #files == 0 or not manager:extractInBackground(files) then return end
    extracting = true
    local function poll()
        if manager:isExtractingInBackground() then
            UIManager:scheduleIn(1, poll)
            return
        end
        extracting = false
        metadata = {}
        Books.clearCovers()
        on_done()
    end
    UIManager:scheduleIn(1, poll)
end

function Books.lastOpened()
    local entry = ReadHistory.hist[1]
    if entry and util.fileExists(entry.file) then return entry.file end
end

return Books
