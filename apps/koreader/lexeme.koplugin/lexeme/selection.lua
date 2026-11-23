--[[
What a long-press on text shows: the selection toolbar above the selection
and, for a single word, the dictionary sheet at the bottom.
]]
local Geom = require("ui/geometry")
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
    close_cb = nil,
    background = false,
}

local SHEET_TOP = 938
local POPUP_W, POPUP_H = 514, 85

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
end

function Selection:close(refresh)
    if self.html then self.html:free() end
    View.close(self, refresh)
    self.ui.highlight:clear()
    if self.close_cb then self.close_cb() end
end

function Selection:onTapOutside()
    self:close()
end

function Selection:render(bb, x, y, w, h)
    -- Taps anywhere but the toolbar and the sheet dismiss the selection.
    self:hit(x, y, w, h, function() self:close() end)
    if self.results then self:paintSheet(bb, x, y + h - D.s(1696 - SHEET_TOP), w, D.s(1696 - SHEET_TOP)) end
    self:paintPopup(bb, w)
end

-- Selection toolbar ---------------------------------------------------------------

function Selection:popupPosition(screen_w)
    local box = self.boxes and self.boxes[1]
    local w, h = D.s(POPUP_W), D.s(POPUP_H)
    if not box then return math.floor((screen_w - w) / 2), D.s(400) end
    local px = math.floor(box.x + box.w / 2 - w / 2)
    px = math.max(D.s(20), math.min(screen_w - w - D.s(20), px))
    local py = box.y - h - D.s(28)
    if py < D.s(100) then py = box.y + box.h + D.s(28) end
    return px, py
end

function Selection:paintPopup(bb, screen_w)
    local px, py = self:popupPosition(screen_w)
    local w, h = D.s(POPUP_W), D.s(POPUP_H)
    self:hit(px, py, w, h, function() end)
    D.rect(bb, px, py, w, h, D.WHITE)
    D.border(bb, px, py, w, h, D.s(3), D.BLACK, D.s(12))
    local cy = py + math.floor(h / 2)

    local ax = px + D.s(30)
    D.roundRect(bb, ax, cy - D.s(18), D.s(36), D.s(36), D.gray(204), D.s(6))
    D.textCenter(bb, ax + D.s(18), cy + D.s(11), D.face("medium", 28), "A")
    self:hit(ax - D.s(20), py, D.s(76), h, function() self:highlight() end)

    D.icon(bb, "sticky-note", px + D.s(106), cy - D.s(21), D.s(42), D.s(42))
    self:hit(px + D.s(90), py, D.s(76), h, function() self:note() end)

    local lookup_enabled = self.results == nil
    D.textCenter(bb, px + D.s(257), cy + D.s(12), D.face("regular", 32), "Look up",
        lookup_enabled and D.BLACK or D.gray(150))
    if lookup_enabled then
        self:hit(px + D.s(180), py, D.s(156), h, function()
            self:closeKeepingSelection()
            self.ui.highlight:lookupDict()
        end)
    end

    D.icon(bb, "book-plus", px + D.s(372), cy - D.s(21), D.s(42), D.s(42))
    self:hit(px + D.s(350), py, D.s(86), h, function() self:addToLexeme() end)

    D.icon(bb, "ellipsis-vertical", px + D.s(456), cy - D.s(19), D.s(38), D.s(38))
    self:hit(px + D.s(440), py, D.s(74), h, function() self:openMore(px + w, py + h + D.s(8)) end)
end

function Selection:closeKeepingSelection()
    if self.html then self.html:free() end
    View.close(self)
end

function Selection:highlight()
    self.ui.highlight:saveHighlight()
    self:close()
end

function Selection:note()
    self.ui.highlight:saveHighlight()
    self:closeKeepingSelection()
    self.ui.highlight:addNote()
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

function Selection:paintSheet(bb, x, top, w, h)
    self:hit(x, top, w, h, function() end)
    D.rect(bb, x, top, w, h, D.WHITE)
    D.rect(bb, x, top, w, D.s(5))
    D.roundRect(bb, x + math.floor((w - D.s(84)) / 2), top + D.s(52), D.s(84), D.s(9), D.BLACK, D.s(4))

    local tx = x + D.s(27)
    for i, label in ipairs(TABS) do
        local active = i == 1
        local face = D.face(active and "bold" or "regular", 32)
        local tw = D.text(bb, tx, top + D.s(1100 - SHEET_TOP), face, label)
        if active then D.rect(bb, tx - D.s(13), top + D.s(1112 - SHEET_TOP), tw + D.s(26), D.s(7)) end
        if not active then
            self:hit(tx - D.s(20), top + D.s(1050 - SHEET_TOP), tw + D.s(40), D.s(90), function()
                local hl = self.ui.highlight
                self:closeKeepingSelection()
                if label == "Wikipedia" then hl:lookupWikipedia()
                elseif label == "Translate" then hl:translate()
                else hl:onHighlightSearch() end
            end)
        end
        tx = tx + tw + D.s(49)
    end

    local content_top = top + D.s(1150 - SHEET_TOP)
    local content_h = D.s(1580 - 1150)
    local content_w = w - D.s(40 + 110)
    if #self.results == 0 then
        D.text(bb, x + D.s(40), content_top + D.s(40), D.face("regular", 32), "No definition found for “" ..
            (self.word or "") .. "”.", D.BLACK, content_w)
    else
        local html = self:htmlWidget(content_w, content_h)
        html:setPageNumber(self.page)
        html:paintTo(bb, x + D.s(40), content_top)
        local up, down = self.page > 1, self.page < html.page_count
        D.icon(bb, up and "triangle-up" or "triangle-up-gray", x + w - D.s(74), content_top, D.s(34), D.s(21))
        D.icon(bb, down and "triangle-down" or "triangle-down-gray", x + w - D.s(74),
            content_top + content_h - D.s(21), D.s(34), D.s(21))
        self:hit(x + w - D.s(110), content_top - D.s(30), D.s(110), D.s(100), function() self:turn(-1) end)
        self:hit(x + w - D.s(110), content_top + content_h - D.s(70), D.s(110), D.s(100), function() self:turn(1) end)
    end

    local footer = top + h - D.s(1696 - 1640)
    local link_face = D.face("regular", 30)
    local lw = D.text(bb, x + D.s(72), footer, link_face, "Add to Lexeme")
    D.rect(bb, x + D.s(72), footer + D.s(8), lw, D.s(2))
    self:hit(x + D.s(40), footer - D.s(50), lw + D.s(64), D.s(80), function() self:addToLexeme() end)
    local dict = self.results[self.index] and self.results[self.index].dict
    if dict then
        D.textRight(bb, x + w - D.s(90), footer, link_face, dict, D.BLACK)
        D.icon(bb, "ellipsis-vertical", x + w - D.s(70), footer - D.s(30), D.s(38), D.s(38))
        if #self.results > 1 then
            self:hit(x + w - D.s(500), footer - D.s(50), D.s(500), D.s(80), function()
                self:chooseDictionary(x + w - D.s(37), footer - D.s(60))
            end)
        end
    end
end

function Selection:turn(delta)
    if not self.html then return end
    local page = math.max(1, math.min(self.html.page_count, self.page + delta))
    if page == self.page then return end
    self.page = page
    self:refresh()
end

function Selection:onSwipe(direction, ges)
    if not self.results or ges.pos.y < Screen:getHeight() - D.s(1696 - SHEET_TOP) then return end
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
        close_cb = opts.close_cb,
    }
    UIManager:show(selection, "ui")
    return selection
end

return Selection
