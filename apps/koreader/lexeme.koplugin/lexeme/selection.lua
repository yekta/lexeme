--[[
What a long-press on text shows: the selection toolbar above the selection
and, for a single word, the dictionary sheet at the bottom.
]]
local Geom = require("ui/geometry")
local GestureRange = require("ui/gesturerange")
local HtmlBoxWidget = require("ui/widget/htmlboxwidget")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local util = require("util")

local D = require("lexeme/draw")
local Menu = require("lexeme/menu")
local Toast = require("lexeme/toast")
local View = require("lexeme/view")
local Words = require("lexeme/words")

local Selection = View:extend{
    ui = nil,
    word = nil,
    results = nil, -- dictionary results; nil when no lookup was made
    boxes = nil,
    -- Set when an existing highlight was tapped: the toolbar acts on it.
    highlight_index = nil,
    close_cb = nil,
    background = false,
}

-- The dictionary sheet as the Kindle lays it out at the bottom of the screen; it opens at the
-- top instead, in the reverse order, when it would cover the selection.
local SHEET_TOP, SHEET_H, TOP_SHIFT = 938, 758, 1042
local TAB_X = { 27, 227, 413, 589 }
local POPUP_W, POPUP_H, POPUP_GAP = 525, 93, 33

local CSS = [[
@page { margin: 0; font-family: 'Noto Sans'; }
body { margin: 0; line-height: 1.35; }
.lexeme-hw { font-weight: bold; font-size: 1.15em; margin-bottom: 0.3em; }
ol, ul { margin: 0; padding: 0 0 0 1.4em; }
blockquote, dd { margin: 0 1em; }
]]

function Selection:init()
    View.init(self)
    self.covers_fullscreen = false
    self.entry = Words.fromSelection(self.ui)
    self.index = 1
    self.page = 1
    local full = Geom:new{ x = 0, y = 0, w = Screen:getWidth(), h = Screen:getHeight() }
    self.ges_events.LexemePan = { GestureRange:new{ ges = "pan", range = full } }
    self.ges_events.LexemePanRelease = { GestureRange:new{ ges = "pan_release", range = full } }
end

function Selection:close(refresh)
    if self.html then self.html:free() end
    View.close(self, refresh)
    self.ui.highlight:clear()
    self.ui.highlight.selected_text = nil
    UIManager:setDirty(self.ui.dialog, "ui")
    if self.close_cb then self.close_cb() end
end

function Selection:onTapOutside()
    self:close()
end

function Selection:sheetAtTop()
    local bottom = 0
    for _, box in ipairs(self.boxes or {}) do bottom = math.max(bottom, box.y + box.h) end
    return bottom + D.s(60) > Screen:getHeight() - D.s(SHEET_H)
end

-- The sheet's top and bottom edges on screen.
function Selection:sheetSpan()
    if self:sheetAtTop() then return 0, D.s(SHEET_H) end
    return Screen:getHeight() - D.s(SHEET_H), Screen:getHeight()
end

function Selection:render(bb, x, y, w, h)
    -- Taps anywhere but the toolbar and the sheet dismiss the selection.
    self:hit(x, y, w, h, function() self:close() end)
    if self.results then self:paintSheet(bb, x, w) end
    self:paintPopup(bb, w)
end

-- Selection toolbar ---------------------------------------------------------------

-- Centred on the selection, above it while the dictionary takes the bottom of the screen and
-- below it otherwise, as on a Kindle; on the other side when it doesn't fit.
function Selection:popupPosition(screen_w)
    local w, h, gap = D.s(POPUP_W), D.s(POPUP_H), D.s(POPUP_GAP)
    local boxes = self.boxes or {}
    if #boxes == 0 then return math.floor((screen_w - w) / 2), D.s(400) end
    local left, right, top, bottom = math.huge, -math.huge, math.huge, -math.huge
    for _, box in ipairs(boxes) do
        left, right = math.min(left, box.x), math.max(right, box.x + box.w)
        top, bottom = math.min(top, box.y), math.max(bottom, box.y + box.h)
    end
    local px = math.floor((left + right - w) / 2)
    px = math.max(D.s(20), math.min(screen_w - w - D.s(20), px))
    local floor, limit = 0, Screen:getHeight()
    if self.results then
        local sheet_top, sheet_bottom = self:sheetSpan()
        if sheet_top == 0 then floor = sheet_bottom else limit = sheet_top end
    end
    local above, below = top - h - gap, bottom + gap
    local fits_above, fits_below = above >= floor + D.s(20), below + h <= limit - D.s(20)
    if self.results then
        return px, (fits_above or not fits_below) and above or below
    end
    return px, (fits_below or not fits_above) and below or above
end

function Selection:paintPopup(bb, screen_w)
    local px, py = self:popupPosition(screen_w)
    local w, h = D.s(POPUP_W), D.s(POPUP_H)
    self:hit(px, py, w, h, function() end)
    -- A highlight already: the A sits on black, and tapping it removes the highlight.
    local highlighted = self.highlight_index ~= nil
    D.icon(bb, highlighted and "selection-toolbar-highlighted" or "selection-toolbar", px, py, w, h)
    if highlighted then D.rect(bb, px + D.s(26), py + D.s(26), D.s(43), D.s(43), D.WHITE) end
    D.rect(bb, px + D.s(30), py + D.s(30), D.s(35), D.s(35), D.gray(221))
    D.textCenter(bb, px + D.s(47), py + D.s(59), D.face("medium", 34), "A")
    self:hit(px, py, D.s(92), h, function() self:highlight() end)

    D.icon(bb, "kindle-note", px + D.s(115), py + D.s(29), D.s(37), D.s(37))
    self:hit(px + D.s(92), py, D.s(86), h, function() self:note() end)

    local lookup_enabled = self.results == nil
    D.text(bb, px + D.s(206), py + D.s(58), D.face("regular", 32), "Look up",
        lookup_enabled and D.BLACK or D.gray(119))
    if lookup_enabled then
        self:hit(px + D.s(178), py, D.s(170), h, function()
            self:closeKeepingSelection()
            self.ui.highlight:lookupDict()
        end)
    end

    D.icon(bb, "book-plus", px + D.s(376), py + D.s(30), D.s(34), D.s(34))
    self:hit(px + D.s(348), py, D.s(90), h, function() self:addToLexeme() end)

    D.icon(bb, "ellipsis-vertical", px + D.s(458), py + D.s(25), D.s(45), D.s(45))
    self:hit(px + D.s(438), py, w - D.s(438), h, function() self:openMore(px + w, py + h + D.s(8)) end)
end

function Selection:closeKeepingSelection()
    if self.html then self.html:free() end
    View.close(self)
end

--[[
Highlighting over existing highlights joins them into one, as on a Kindle: they
are removed and the selection grows to cover them, keeping their notes.
]]
local function absorbOverlapping(ui)
    local selected = ui.highlight.selected_text
    if not (ui.rolling and selected and selected.pos0 and selected.pos1) then return end
    local document = ui.document
    local function before(a, b) return document:compareXPointers(a, b) == 1 end
    local pos0, pos1, notes, overlapping = selected.pos0, selected.pos1, {}, {}
    for i, item in ipairs(ui.annotation.annotations) do
        local overlaps = item.pos0 and item.pos1
            and not before(item.pos1, selected.pos0) and not before(selected.pos1, item.pos0)
        if overlaps then
            table.insert(overlapping, i)
            if before(item.pos0, pos0) then pos0 = item.pos0 end
            if before(pos1, item.pos1) then pos1 = item.pos1 end
            if item.note then table.insert(notes, item.note) end
        end
    end
    if #overlapping == 0 then return end
    for i = #overlapping, 1, -1 do ui.highlight:deleteHighlight(overlapping[i]) end
    selected.pos0, selected.pos1 = pos0, pos1
    selected.text = document:getTextFromXPointers(pos0, pos1)
    if #notes > 0 then selected.note = table.concat(notes, "\n\n") end
end

-- Saves the selection as one highlight, joining any it overlaps; returns its index.
local function saveSelection(ui)
    absorbOverlapping(ui)
    return ui.highlight:saveHighlight()
end

function Selection:highlight()
    if self.highlight_index then
        self.ui.highlight:deleteHighlight(self.highlight_index)
    else
        saveSelection(self.ui)
    end
    self:close()
end

function Selection:note()
    local index = self.highlight_index or saveSelection(self.ui)
    local item = index and self.ui.annotation.annotations[index]
    self:close()
    if item then self.ui.highlight:editNote(index, item.note == nil) end
end

function Selection:addToLexeme()
    local entry = self.entry or (self.word and { word = self.word })
    self:close()
    if not entry then return end
    if Words.add(entry) then
        require("lexeme/sync").soon()
        Toast.show("Added to Lexeme")
    else
        Toast.show("Already in Lexeme")
    end
end

function Selection:openMore(right, top)
    local hl = self.ui.highlight
    local items = {
        { text = "Add to Lexeme", callback = function() self:addToLexeme() end },
        {
            text = "Copy",
            callback = function()
                local Device = require("device")
                if hl.selected_text then
                    Device.input.setClipboardText(util.cleanupSelectedText(hl.selected_text.text))
                end
                self:close()
            end,
        },
        { text = "Translate", callback = function() self:closeKeepingSelection() hl:translate() end },
        { text = "Wikipedia", callback = function() self:closeKeepingSelection() hl:lookupWikipedia() end },
        { text = "Search in book", callback = function() self:closeKeepingSelection() hl:onHighlightSearch() end },
    }
    Menu:new{ items = items, right = math.min(right, Screen:getWidth() - D.s(20)), top = top }:show()
end

-- Dictionary sheet ------------------------------------------------------------------

local TABS = { "Dictionary", "Wikipedia", "Translate", "Search" }

local function definitionHtml(result)
    local body = result.definition or ""
    if not result.is_html then
        body = util.htmlEscape(body):gsub("\n", "<br/>")
    end
    return '<div class="lexeme-hw">' .. util.htmlEscape(result.word or "") .. "</div>" .. body
end

function Selection:htmlWidget(w, h)
    if self.html and self.html_index == self.index then return self.html end
    if self.html then self.html:free() end
    local result = self.results[self.index]
    self.html = HtmlBoxWidget:new{ dimen = Geom:new{ w = w, h = h } }
    self.html:setContent(definitionHtml(result), (result.css or "") .. CSS, D.s(34), false, nil,
        result.dictionary_resource_directory)
    self.html_index = self.index
    return self.html
end

function Selection:paintSheet(bb, x, w)
    local at_top = self:sheetAtTop()
    local sheet_top, sheet_bottom = self:sheetSpan()
    -- Everything from the tabs to the footer sits at the same place relative to this.
    local block = at_top and D.s(SHEET_TOP - TOP_SHIFT) or sheet_top
    self:hit(x, sheet_top, w, sheet_bottom - sheet_top, function() end)
    D.rect(bb, x, sheet_top, w, sheet_bottom - sheet_top, D.WHITE)
    local edge_y = at_top and sheet_bottom - D.s(9) or sheet_top
    local handle_y = at_top and sheet_bottom - D.s(52) or sheet_top + D.s(52)
    D.rect(bb, x, edge_y, w, D.s(9))
    D.icon(bb, "sheet-handle", x + math.floor((w - D.s(111)) / 2) + D.s(1), handle_y, D.s(111), D.s(7))

    for i, label in ipairs(TABS) do
        local active = i == 1
        local tx = x + D.s(TAB_X[i])
        local tw = D.text(bb, tx, block + D.s(172), D.face(active and "bold" or "regular", 32), label)
        if not active then
            self:hit(tx - D.s(20), block + D.s(122), tw + D.s(40), D.s(90), function()
                local hl = self.ui.highlight
                self:closeKeepingSelection()
                if label == "Wikipedia" then hl:lookupWikipedia()
                elseif label == "Translate" then hl:translate()
                else hl:onHighlightSearch() end
            end)
        end
    end
    D.rect(bb, x + D.s(5), block + D.s(210), D.s(200), D.s(9))
    D.rect(bb, x + D.s(5), block + D.s(219), w - D.s(11), D.s(4))

    local content_top, content_h, content_w = block + D.s(257), D.s(350), D.s(1096)
    if #self.results == 0 then
        D.text(bb, x + D.s(40), content_top + D.s(40), D.face("regular", 32), "No definition found for “" ..
            (self.word or "") .. "”.", D.BLACK, content_w)
    else
        local html = self:htmlWidget(content_w, content_h)
        html:setPageNumber(self.page)
        html:paintTo(bb, x + D.s(40), content_top)
        self:paintScroll(bb, x + D.s(1192), block, html.page_count)
    end

    local footer = block + D.s(702)
    local link_face = D.face("regular", 30)
    local lw = D.text(bb, x + D.s(72), footer, link_face, "Add to Lexeme")
    D.rect(bb, x + D.s(72), footer + D.s(7), lw, D.s(3))
    self:hit(x + D.s(40), footer - D.s(50), lw + D.s(64), D.s(80), function() self:addToLexeme() end)
    local dict = self.results[self.index] and self.results[self.index].dict
    if dict then
        D.textRight(bb, x + D.s(1183), footer, link_face, dict, D.BLACK)
        D.icon(bb, "ellipsis-vertical", x + D.s(1201), footer - D.s(31), D.s(45), D.s(45))
        if #self.results > 1 then
            self:hit(x + w - D.s(500), footer - D.s(50), D.s(500), D.s(80), function()
                self:chooseDictionary(x + w - D.s(37), footer - D.s(60))
            end)
        end
    end
end

-- The arrows and the Kindle's hatched scrollbar beside the definition.
function Selection:paintScroll(bb, left, block, pages)
    local up, down = self.page > 1, self.page < pages
    local arrow_w, arrow_h = D.s(35), D.s(21)
    D.icon(bb, up and "triangle-up" or "triangle-up-gray", left, block + D.s(263), arrow_w, arrow_h)
    D.icon(bb, down and "triangle-down" or "triangle-down-gray", left, block + D.s(582), arrow_w, arrow_h)
    self:hit(left - D.s(40), block + D.s(233), D.s(110), D.s(90), function() self:turn(-1) end)
    self:hit(left - D.s(40), block + D.s(552), D.s(110), D.s(90), function() self:turn(1) end)
    if pages <= 1 then return end
    local track_x, track_top, track_bottom = left + D.s(12), block + D.s(326), block + D.s(538)
    for ty = track_top, track_bottom do
        local dx = 4 - (ty - track_top + 1) % 5
        bb:setPixel(track_x + dx, ty, D.BLACK)
        bb:setPixel(track_x + dx + 5, ty, D.BLACK)
    end
    local span = track_bottom - track_top + 1
    local thumb_h = math.max(D.s(20), math.floor(span / pages))
    local thumb_y = track_top + math.floor((span - thumb_h) * (self.page - 1) / (pages - 1))
    D.roundRect(bb, track_x + D.s(1), thumb_y, D.s(9), thumb_h, D.BLACK, D.s(4))
end

function Selection:turn(delta)
    if not self.html then return end
    local page = math.max(1, math.min(self.html.page_count, self.page + delta))
    if page == self.page then return end
    self.page = page
    self:refresh()
end

-- Dragging a handle moves that end of the selection, as on a Kindle --------------------

-- The ends of the selection on screen, and the handles' centres.
function Selection:ends()
    local boxes = self.boxes or {}
    if #boxes == 0 then return end
    local first, last = boxes[1], boxes[1]
    for _, box in ipairs(boxes) do
        if box.y < first.y or (box.y == first.y and box.x < first.x) then first = box end
        if box.y > last.y or (box.y == last.y and box.x > last.x) then last = box end
    end
    local start_pos = { x = first.x + 2, y = first.y + math.floor(first.h / 2) }
    local end_pos = { x = last.x + last.w - 3, y = last.y + math.floor(last.h / 2) }
    local start_handle = { x = first.x, y = first.y - D.s(14) }
    local end_handle = { x = last.x + last.w - 2, y = last.y + last.h + D.s(20) }
    return start_pos, end_pos, start_handle, end_handle
end

function Selection:handleAt(pos)
    if not self.ui.rolling then return end
    local _, _, start_handle, end_handle = self:ends()
    if not start_handle then return end
    local reach = D.s(50)
    local function near(p) return math.abs(pos.x - p.x) <= reach and math.abs(pos.y - p.y) <= reach end
    if near(end_handle) then return "end" end
    if near(start_handle) then return "start" end
end

function Selection:dragTo(pos)
    local hl = self.ui.highlight
    local start_pos, end_pos = self.drag_start, self.drag_end
    if self.dragging == "end" then end_pos = pos else start_pos = pos end
    local selected = self.ui.document:getTextFromPositions(start_pos, end_pos)
    if not (selected and selected.sboxes and #selected.sboxes > 0) then return end
    hl.selected_text = selected
    self.boxes = selected.sboxes
    self.highlight_index = nil
    UIManager:setDirty(self.ui.dialog, "ui")
    self:refresh()
end

function Selection:endDrag()
    self.dragging = nil
    local selected = self.ui.highlight.selected_text
    if not (selected and selected.text) then return end
    local text = util.cleanupSelectedText(selected.text)
    if text ~= "" and not text:find("%s") then
        self:closeKeepingSelection()
        self.ui.highlight:lookupDict()
        return
    end
    if self.html then self.html:free() end
    self.html = nil
    self.results = nil
    self.word = nil
    self.entry = Words.fromSelection(self.ui)
    self:refresh()
end

function Selection:startDrag(pos)
    local which = self:handleAt(pos)
    if not which then return false end
    self.dragging = which
    self.drag_start, self.drag_end = self:ends()
    return true
end

function Selection:onLexemePan(_, ges)
    if not self.dragging and not self:startDrag(ges.start_pos or ges.pos) then return true end
    self:dragTo(ges.pos)
    return true
end

function Selection:onLexemePanRelease(_, ges)
    if not self.dragging then return true end
    self:dragTo(ges.pos)
    self:endDrag()
    return true
end

function Selection:onSwipe(direction, ges)
    if self.dragging or self:startDrag(ges.pos) then
        self:dragTo(ges.end_pos)
        self:endDrag()
        return true
    end
    local sheet_top, sheet_bottom = self:sheetSpan()
    if not self.results or ges.pos.y < sheet_top or ges.pos.y > sheet_bottom then return end
    if direction == "north" then self:turn(1) elseif direction == "south" then self:turn(-1) end
    return true
end

function Selection:chooseDictionary(right, bottom)
    local items = {}
    for i, result in ipairs(self.results) do
        table.insert(items, { text = result.dict, callback = function()
            self.index = i
            self.page = 1
            self:refresh()
        end })
    end
    Menu:new{ items = items, right = right, bottom = bottom }:show()
end

function Selection.show(ui, opts)
    local selection = Selection:new{
        ui = ui,
        word = opts.word,
        results = opts.results,
        boxes = opts.boxes,
        highlight_index = opts.highlight_index,
        close_cb = opts.close_cb,
    }
    UIManager:show(selection, "ui")
    return selection
end

return Selection
