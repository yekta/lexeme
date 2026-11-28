-- Highlight positions, the pages of annotations and the Kindle locations of pages, kept per layout
-- and saved when a book closes.
-- KOReader otherwise looks up every highlight before the page on each paint (half a second with a
-- few hundred highlights), and the pages of a dozen or more annotations, to find the page's
-- bookmark, each time the page changes: 80 ms each time the book opens.
local DataStorage = require("datastorage")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local dump = require("dump")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local Positions = {}

local DIR = DataStorage:getDataDir() .. "/cache/lexeme-positions"

-- The book's file and its layout: crengine's rendering hash, the laid-out height and the screen.
local function layoutKey(ui)
    local document = ui.document
    local md5 = ui.doc_settings and ui.doc_settings:readSetting("partial_md5_checksum")
    if not md5 or not document.been_rendered then return nil end
    return table.concat({ md5, document:getDocumentRenderingHash(true), document.info.doc_height or 0,
        Screen:getWidth(), Screen:getHeight() }, ":")
end

local function savedPath(key)
    return DIR .. "/" .. key:match("^[^:]+") .. ".lua"
end

local function load(key)
    local path = savedPath(key)
    if lfs.attributes(path, "mode") ~= "file" then return nil end
    local ok, saved = pcall(dofile, path)
    if not ok or type(saved) ~= "table" or saved.key ~= key or type(saved.pos) ~= "table" then return nil end
    local pos, pages = {}, {}
    for xp, y in pairs(saved.pos) do
        if type(xp) == "string" and type(y) == "number" then pos[xp] = y end
    end
    for xp, page in pairs(type(saved.pages) == "table" and saved.pages or {}) do
        if type(xp) == "string" and type(page) == "number" then pages[xp] = page end
    end
    local locations = {}
    for xp, label in pairs(type(saved.locations) == "table" and saved.locations or {}) do
        if type(xp) == "string" and (type(label) == "number" or label == false) then locations[xp] = label end
    end
    return { key = key, pos = pos, pages = pages, locations = locations }
end

function Positions.install(ui)
    if not ui.rolling then return end
    local view, document = ui.view, ui.document
    -- Saved positions are only trusted when the book opens; after that they're worked out again.
    local may_load = true

    -- The memo for the layout now; nil until the book is laid out.
    local function current()
        local key = layoutKey(ui)
        if not key then return nil end
        local memo = view.lexeme_positions
        if memo and memo.key == key then return memo end
        memo = may_load and load(key) or { key = key, pos = {}, pages = {}, locations = {} }
        may_load = false
        view.lexeme_positions = memo
        return memo
    end
    view.lexeme_positions_current = current

    -- The page an xpointer is on is the layout's too.
    local get_page = document.getPageFromXPointer
    document.getPageFromXPointer = function(doc, xp)
        local memo = type(xp) == "string" and current()
        if not memo then return get_page(doc, xp) end
        local page = memo.pages[xp]
        if page == nil then
            page = get_page(doc, xp)
            if type(page) == "number" then
                memo.pages[xp] = page
                memo.changed = true
            end
        end
        return page
    end

    local draw = view.drawXPointerSavedHighlight
    view.drawXPointerSavedHighlight = function(v, bb, x, y)
        local memo = current()
        if not memo then return draw(v, bb, x, y) end
        local own = rawget(document, "getPosFromXPointer")
        local get = document.getPosFromXPointer
        document.getPosFromXPointer = function(doc, xp)
            local pos = memo.pos[xp]
            if pos == nil then
                pos = get(doc, xp)
                memo.pos[xp] = pos
                memo.changed = true
            end
            return pos
        end
        local ok, result = pcall(draw, v, bb, x, y)
        rawset(document, "getPosFromXPointer", own)
        if not ok then error(result, 0) end
        return result
    end

    -- KOReader forgets its highlight boxes when the book is laid out again (and on a few other
    -- changes); the positions go with them.
    for _, name in ipairs({ "resetHighlightBoxesCache", "onDocumentRerendered", "onReflowUpdated" }) do
        local original = view[name]
        if original then
            view[name] = function(v, items, ...)
                if type(items) ~= "table" then
                    view.lexeme_positions = nil
                    may_load = false
                end
                return original(v, items, ...)
            end
        end
    end
end

-- The memo for the book's layout now, which other modules can keep what depends on the layout
-- in (Lexeme's locations: memo.locations); nil until the book is laid out.
function Positions.memo(ui)
    local current = ui.view and ui.view.lexeme_positions_current
    return current and current() or nil
end

local function write(memo)
    if lfs.attributes(DIR, "mode") ~= "directory" and not lfs.mkdir(DIR) then return end
    local path = savedPath(memo.key)
    local file = io.open(path .. ".part", "w")
    if not file then return end
    file:write("return ", dump({ key = memo.key, pos = memo.pos, pages = memo.pages, locations = memo.locations }), "\n")
    file:close()
    if not os.rename(path .. ".part", path) then
        logger.warn("Lexeme: can't save highlight positions to", path)
        os.remove(path .. ".part")
    end
end

-- Keeps the positions for the next opening; called as the book closes. They're written a moment
-- later, once Home is up, rather than while the book closes.
function Positions.save(ui)
    -- The page where reading stopped: the first the next opening looks up.
    local xp = ui.rolling and ui.rolling.xpointer
    if type(xp) == "string" and ui.document then pcall(ui.document.getPageFromXPointer, ui.document, xp) end
    local memo = ui.view and ui.view.lexeme_positions
    if not (memo and memo.changed and memo.key
        and (next(memo.pos) or next(memo.pages) or next(memo.locations or {}))) then return end
    memo.changed = nil
    UIManager:scheduleIn(1, function() write(memo) end)
end

return Positions
