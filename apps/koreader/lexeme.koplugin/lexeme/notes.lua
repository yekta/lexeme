--[[
Links in the text, as the Kindle's reader follows them:

- A footnote opens in a sheet at the bottom of the page: "Footnote 4", the note as the book sets it,
  and "Go to footnotes". The note is drawn by crengine as it lays it out in the book, so it looks the
  same as where it stands.
- Any other link is followed, and a bar takes the place of the line under the page: "Back to loc 323"
  on the left, "Stay here" on the right. It stays, page after page, until one of them is tapped.
- "Go to footnotes" follows the link the same way, and points at the note with a black triangle and
  its number shown inverted.
- A long press on a note's number doesn't select it.

Which notes open in the sheet follows Amazon's reader, which shows notes the book marks as
footnotes (epub:type="footnote", as Amazon's conversion writes them) and follows the rest.
]]
local Blitbuffer = require("ffi/blitbuffer")
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local logger = require("logger")

local Back = require("lexeme/backstack")
local D = require("lexeme/draw")
local View = require("lexeme/view")

local Notes = {}

-- Per book: { bar = { origin = xp }, target = { page, box } }.
local states = setmetatable({}, { __mode = "k" })

local function state(ui)
    local document = ui and ui.document
    if not document then return {} end
    states[document] = states[document] or {}
    return states[document]
end

-- The bar's strip at the bottom of the screen, on a Paperwhite 5: its rule's top is 93 px up.
local BAR_TOP = 1555

local function barStrip()
    local w, h = Screen:getWidth(), Screen:getHeight()
    local top = D.bottom(h, BAR_TOP)
    return Geom:new{ x = 0, y = top, w = w, h = h - top }
end

-- The opening tags of the HTML crengine gives for a link's target, up to its first text: the note's
-- own element (and, for a note that is a file of its own, its file's).
local function leadingTags(html)
    local tags, pos = {}, 1
    while true do
        pos = html:find("%S", pos)
        if not pos or html:sub(pos, pos) ~= "<" then break end
        local close = html:find(">", pos, true)
        if not close then break end
        table.insert(tags, html:sub(pos, close))
        pos = close + 1
    end
    return tags
end

-- "footnote", "endnote" or nil: what the book says the link's target is.
function Notes.kind(ui, xp)
    local ok, html = pcall(ui.document.getHTMLFromXPointer, ui.document, xp, 0, false)
    if not ok or type(html) ~= "string" then return nil end
    for _, tag in ipairs(leadingTags(html:sub(1, 2000))) do
        local kind = tag:match('epub:type="([^"]*)"') or tag:match('role="doc%-([^"]*)"') or ""
        if kind:find("footnote") then return "footnote" end
        if kind:find("endnote") or kind:find("rearnote") then return "endnote" end
    end
end

-- The element holding the note, as an xpointer path: the deepest element on the path to the note's
-- first word that is named like the target's own element.
local function container(ui, target, first)
    local ok, html = pcall(ui.document.getHTMLFromXPointer, ui.document, target, 0, false)
    if not ok or type(html) ~= "string" then return nil end
    local name
    for _, tag in ipairs(leadingTags(html:sub(1, 2000))) do
        local n = tag:match("^<([%w_:-]+)")
        if n and n ~= "DocFragment" and n ~= "body" then
            name = n
            break
        end
    end
    if not name then return nil end
    local path
    local pos = 1
    while true do
        local s, e = first:find("/" .. name .. "[%[/.]", pos)
        if not s then break end
        local stop = first:sub(e, e) == "[" and first:find("]", e, true) or e - 1
        path = first:sub(1, stop)
        pos = stop + 1
    end
    return path
end

local function inside(xp, path)
    if xp:sub(1, #path) ~= path then return false end
    local after = xp:sub(#path + 1, #path + 1)
    return after == "/" or after == "." or after == ""
end

-- The note's first and last words.
local function noteRange(ui, target)
    local doc = ui.document
    local first = doc:getNextVisibleWordStart(target)
    if not first then return nil end
    local path = container(ui, target, first)
    if not path then return nil end
    local last, cur = first, first
    for _ = 1, 4000 do
        local nxt = doc:getNextVisibleWordStart(cur)
        if not nxt or nxt == cur or not inside(nxt, path) then break end
        last, cur = nxt, nxt
    end
    return first, doc:getNextVisibleWordEnd(last) or last
end

-- The note's lines as crengine draws them on their pages: { bb, y0, y1 } per page, the band from
-- its first line's top to its last line's bottom. The page shown doesn't change.
local function renderNote(ui, first, stop)
    local doc = ui.document
    local w, h = Screen:getWidth(), Screen:getHeight()
    local p0, p1 = doc:getPageFromXPointer(first), doc:getPageFromXPointer(stop)
    local shown = doc:getCurrentPage()
    local pieces = {}
    local ok, err = pcall(function()
        for page = p0, math.min(p1, p0 + 4) do
            local bb = Blitbuffer.new(w, h, Screen.bb:getType())
            doc:drawCurrentViewByPage(bb, 0, 0, Geom:new{ x = 0, y = 0, w = w, h = h }, page)
            local a = page == p0 and first or doc:getPageXPointer(page)
            local b = page == p1 and stop or doc:getPageXPointer(page + 1)
            local y0, y1
            for _, box in ipairs(doc:getScreenBoxesFromPositions(a, b, true)) do
                if box.y >= 0 and box.y < h then
                    y0 = math.min(y0 or box.y, box.y)
                    y1 = math.max(y1 or 0, box.y + box.h)
                end
            end
            if y0 then
                table.insert(pieces, { bb = bb, y0 = y0, y1 = math.min(y1, h) })
            else
                bb:free()
            end
        end
    end)
    doc:gotoPage(shown)
    if not ok then
        logger.warn("Lexeme: footnote", err)
        for _, piece in ipairs(pieces) do piece.bb:free() end
        return nil
    end
    return pieces
end

-- The note's number, for the sheet's title: the link's own text, without brackets or a period.
local function noteNumber(ui, link)
    local ok, text = pcall(ui.document.getTextFromXPointer, ui.document, link.a_xpointer or link.from_xpointer)
    text = ok and text or ""
    local number = text:match("(%d+)%p*$") or text:match("([%w]+)%p*$") or ""
    if #number > 4 then number = "" end
    return number
end

local Sheet = View:extend{
    ui = nil,
    link = nil,
    pieces = nil,
    number = "",
}

-- Measured off Amazon's sheet on a Paperwhite 5, from the bottom up: "Go to footnotes" sits on a
-- baseline 30 px up, the note ends 120 px up, its top is 20 px under a 4 px rule, the title's baseline
-- is 30 px above that rule, the handle 146 px and the sheet's 9 px top border 178 px.
local GOTO_BASELINE, NOTE_BOTTOM = 30, 120

function Sheet:init()
    local w, h = Screen:getWidth(), Screen:getHeight()
    local note_h = 0
    for _, piece in ipairs(self.pieces) do note_h = note_h + piece.y1 - piece.y0 end
    -- At most what fits with the sheet's top a third of the way down.
    local max_note = h - D.px(NOTE_BOTTOM) - math.floor(h / 3) - D.px(198)
    self.note_h = math.min(note_h, max_note)
    local rule = h - D.px(NOTE_BOTTOM) - self.note_h - D.px(20)
    self.rule = rule
    local top = rule - D.px(178)
    self.region = Geom:new{ x = 0, y = top, w = w, h = h - top }
    View.init(self)
    self.covers_fullscreen = false
end

function Sheet:render(bb, x, y, w, h)
    local screen_h = y + h
    D.rect(bb, x, y, w, D.px(9))
    local hw, hh = D.px(160), D.px(22)
    D.icon(bb, "popup-handle", x + math.floor((w - hw) / 2) - D.px(1), self.rule - D.px(146), hw, hh)
    self:hit(x, y, w, self.rule - D.px(60) - y, function() self:close() end)
    D.text(bb, x + D.px(80), self.rule - D.px(30), D.nface("bold", 39), "Footnote " .. self.number)
    D.rect(bb, x, self.rule, w, D.px(4))

    -- The note, band after band, cut off at the bottom if it doesn't fit.
    local dy = self.rule + D.px(20)
    local room = self.note_h
    for _, piece in ipairs(self.pieces) do
        if room <= 0 then break end
        local ph = math.min(piece.y1 - piece.y0, room)
        bb:blitFrom(piece.bb, x, dy, 0, piece.y0, w, ph)
        dy, room = dy + ph, room - ph
    end

    local face = D.nface("bold", 29)
    local label = "Go to footnotes"
    local lx, baseline = x + D.px(116), screen_h - D.px(GOTO_BASELINE)
    local lw = D.text(bb, lx, baseline, face, label)
    self:pressable(lx - D.px(30), baseline - D.px(55), lw + D.px(60), D.px(80), function()
        self:close()
        Notes.follow(self.ui, self.link.xpointer, true)
    end, { x = lx - D.px(12), y = baseline - D.px(38), w = lw + D.px(24), h = D.px(50) })
end

function Sheet:onSwipe(direction)
    if direction == "south" then self:close() end
    return true
end

function Sheet:onCloseWidget()
    for _, piece in ipairs(self.pieces or {}) do piece.bb:free() end
    self.pieces = {}
end

function Notes.showSheet(ui, link)
    local first, stop = noteRange(ui, link.xpointer)
    if not first then return false end
    local pieces = renderNote(ui, first, stop)
    if not pieces or #pieces == 0 then return false end
    Sheet:new{ ui = ui, link = link, pieces = pieces, number = noteNumber(ui, link) }:show("ui")
    return true
end

-- Follows a link in the book: the page left can be gone back to from the bar under the page.
-- `point` marks the note it lands on, as "Go to footnotes" does.
function Notes.follow(ui, target, point)
    local s = state(ui)
    local origin = ui.document:getXPointer()
    s.target = nil
    Back.follow(ui, target)
    s.bar = { origin = origin }
    if point then
        local first = ui.document:getNextVisibleWordStart(target)
        local last = first and ui.document:getNextVisibleWordEnd(first)
        local box = first and last and ui.document:getScreenBoxesFromPositions(first, last, true)[1]
        if box then s.target = { page = ui.document:getCurrentPage(), box = box } end
    end
    UIManager:setDirty(ui.dialog, "ui")
end

function Notes.barActive(ui)
    return state(ui).bar ~= nil
end

local function closeBar(ui, go_back)
    local s = state(ui)
    local bar = s.bar
    s.bar, s.target = nil, nil
    if go_back and bar then
        Back.follow(ui, bar.origin)
        UIManager:setDirty(ui.dialog, "ui")
    else
        Back.settle(ui)
        UIManager:setDirty(ui.dialog, "ui", barStrip())
    end
end

-- The bar under the page: a 4 px rule, "Back to loc 323" and "Stay here", underlined.
function Notes.paintBar(bb, ui)
    local bar = state(ui).bar
    if not bar then return end
    local w, h = Screen:getWidth(), Screen:getHeight()
    local strip = barStrip()
    D.rect(bb, 0, strip.y, w, strip.h, D.WHITE)
    D.rect(bb, 0, strip.y, w, D.px(4))
    local face = D.nface("bold", 37)
    local baseline, underline = D.bottom(h, 1606), D.bottom(h, 1616)
    local back = "Back to " .. Back.label(ui, bar.origin, false)
    local back_w = D.text(bb, D.px(56), baseline, face, back)
    D.rect(bb, D.px(56), underline, back_w + D.px(1), D.px(4))
    local stay = "Stay here"
    local stay_w = D.width(face, stay)
    D.text(bb, w - D.px(57) - stay_w, baseline, face, stay)
    D.rect(bb, w - D.px(57) - stay_w - D.px(2), underline, stay_w + D.px(3), D.px(4))
end

-- The black triangle and inverted number on the note "Go to footnotes" went to.
local Target = require("ui/widget/container/widgetcontainer"):extend{}

function Target:paintTo(bb)
    local target = state(self.ui).target
    if not (target and self.ui.document and self.ui.document:getCurrentPage() == target.page) then return end
    local box = target.box
    D.icon(bb, "footnote-target", box.x - D.px(14) - D.px(57), box.y, D.px(57), box.h)
    bb:invertRect(box.x, box.y, box.w, box.h)
    bb:lightenRect(box.x, box.y, box.w, box.h, 65 / 255)
end

-- Whether a link is a note's number, as KOReader's footnote check sees its source: a number, a
-- letter or two, raised, or marked as a note reference.
local function isNoteNumber(ui, link)
    if not (link.a_xpointer and link.xpointer) then return false end
    local flags = 0x0002 + 0x0004 + 0x0008 + 0x0100 + 0x0200 + 0x0400 + 0x0800
    local ok, is_note = pcall(ui.document.isLinkToFootnote, ui.document, link.a_xpointer, link.xpointer, flags, 10000)
    return ok and is_note
end

function Notes.install(ui)
    if not ui.rolling then return end
    ui.view:registerViewModule("lexeme_note_target", Target:new{ ui = ui })

    local show_link_box = ui.link.showLinkBox
    ui.link.showLinkBox = function(link_module, link, allow_footnote_popup)
        local doc = ui.document
        if not (link and link.xpointer and link.xpointer ~= "" and doc:isXPointerInDocument(link.xpointer)) then
            return show_link_box(link_module, link, allow_footnote_popup)
        end
        if Notes.kind(ui, link.xpointer) == "footnote" then
            local ok, shown = pcall(Notes.showSheet, ui, link)
            if not ok then logger.warn("Lexeme: footnote sheet", shown) end
            if ok and shown then return true end
        end
        Notes.follow(ui, link.xpointer)
        return true
    end

    -- A tap on the bar: its left half goes back, its right half stays.
    local strip = barStrip()
    local h = Screen:getHeight()
    ui:registerTouchZones({
        {
            id = "lexeme_link_bar_tap",
            ges = "tap",
            screen_zone = { ratio_x = 0, ratio_y = strip.y / h, ratio_w = 1, ratio_h = strip.h / h },
            handler = function(ges)
                if not Notes.barActive(ui) then return false end
                closeBar(ui, ges.pos.x < Screen:getWidth() / 2)
                return true
            end,
            overrides = {
                "lexeme_footer_tap", "tap_link",
                "readerconfigmenu_ext_tap", "readerconfigmenu_tap", "tap_forward", "tap_backward",
                "readermenu_tap", "readermenu_ext_tap", "readerhighlight_tap", "tap_top_left_corner",
                "tap_top_right_corner", "tap_left_bottom_corner", "tap_right_bottom_corner",
            },
        },
    })

    local on_hold = ui.highlight.onHold
    ui.highlight.onHold = function(highlight, arg, ges)
        local link = ges and ui.link:getLinkFromGes(ges)
        if link and isNoteNumber(ui, link) then return true end
        return on_hold(highlight, arg, ges)
    end
end

return Notes
