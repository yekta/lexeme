--[[
Books converted from Kindle documents (KFX) can arrive with the Kindle reader's state in their
sidecar, as lexeme_amazon_import:

    last_read    where the Kindle reader left off
    annotations  highlights and notes: start, end, datetime, datetime_updated, note

Each position is the id of an anchor placed in the book at that spot ("#_doc_fragment_<n>_ <id>",
as crengine names ids once the book is one document). On the book's first open they become
KOReader's highlights and reading position, and the import is removed so it's applied only once.
Highlights stay on the Kindle like any other: sync.lua leaves them out unless the reader turns
"Sync highlights and notes" on.
]]
local Event = require("ui/event")
local UIManager = require("ui/uimanager")
local logger = require("logger")
local util = require("util")

local AmazonImport = {}

-- An anchor is an empty element just before a character, so its position is just after the
-- character before it.
local function anchorPosition(document, id)
    local element = document:getNormalizedXPointer(id)
    if not element then return nil end
    local before = document:getPrevVisibleChar(element)
    return before and document:getNextVisibleChar(before) or element
end

local function addAnnotations(ui, annotations)
    local document = ui.document
    local highlight = ui.view.highlight
    local first_index, highlights, notes, missing = nil, 0, 0, 0
    for _, a in ipairs(annotations) do
        local pos0, pos1 = anchorPosition(document, a.start), anchorPosition(document, a["end"])
        -- 1 when pos1 comes after pos0; nil when either isn't in the book.
        if pos0 and pos1 and (document:compareXPointers(pos0, pos1) or 0) > 0 then
            local index = ui.annotation:addItem({
                page = pos0,
                pos0 = pos0,
                pos1 = pos1,
                text = util.cleanupSelectedText(document:getTextFromXPointers(pos0, pos1) or ""),
                datetime = a.datetime,
                datetime_updated = a.datetime_updated,
                drawer = highlight.saved_drawer or "lighten",
                color = highlight.saved_color,
                note = a.note,
                chapter = ui.toc:getTocTitleByPage(pos0),
            })
            first_index = first_index and math.min(first_index, index) or index
            if a.note then notes = notes + 1 else highlights = highlights + 1 end
        else
            missing = missing + 1
        end
    end
    if missing > 0 then logger.warn("Lexeme: Amazon annotations not found in the book:", missing) end
    if first_index then
        ui:handleEvent(Event:new("AnnotationsModified", {
            ui.annotation.annotations[first_index],
            index_modified = first_index,
            nb_highlights_added = highlights,
            nb_notes_added = notes,
        }))
    end
    return highlights + notes
end

-- Applies a book's import, if it has one. Runs once the book is laid out.
function AmazonImport.apply(ui)
    if not (ui.rolling and ui.doc_settings) then return end
    local data = ui.doc_settings:readSetting("lexeme_amazon_import")
    if type(data) ~= "table" then return end
    UIManager:nextTick(function()
        if not ui.document then return end
        local added = addAnnotations(ui, data.annotations or {})
        local last = data.last_read and anchorPosition(ui.document, data.last_read)
        if last then ui:handleEvent(Event:new("GotoXPointer", last)) end
        ui.doc_settings:delSetting("lexeme_amazon_import")
        ui:saveSettings()
        logger.info("Lexeme: applied the Kindle reader's state:", added, "annotations,",
            last and ("location " .. tostring(data.last_read_location)) or "no position")
    end)
end

return AmazonImport
