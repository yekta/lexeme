--[[
What Vocabulary Builder's screens share: measurements, the dropdown, a word's sentence with the
word in bold, its dictionary entries, the word card and About Vocabulary Builder.
Measurements were taken off Amazon's Vocabulary Builder on a Paperwhite 5 (1236 px wide).
]]
local Geom = require("ui/geometry")
local HtmlBoxWidget = require("ui/widget/htmlboxwidget")
local Screen = require("device").screen
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")
local Utf8Proc = require("ffi/utf8proc")
local logger = require("logger")
local lfs = require("libs/libkoreader-lfs")

local D = require("lexeme/draw")
local Definition = require("lexeme/definition")
local Dialog = require("lexeme/dialog")
local Languages = require("lexeme/languages")
local View = require("lexeme/view")
local Vocabulary = require("lexeme/vocabulary")

local UI = {}

--[[
Keeps a mistake in these screens from taking KOReader down: painting and taps that fail are
logged, and the screen says so instead.
]]
function UI.guard(class)
    local render, hit = class.render, class.hit
    function class:render(bb, x, y, w, h)
        local ok, err = pcall(render, self, bb, x, y, w, h)
        if ok then return end
        logger.warn("Lexeme: Vocabulary Builder", err)
        D.rect(bb, x, y, w, h, D.WHITE)
        D.textCenter(bb, x + math.floor(w / 2), y + math.floor(h / 2), D.face("regular", 32),
            "Something went wrong here.")
        self.hits = {}
        View.hit(self, x, y, w, h, function() self:close() end)
    end
    function class:hit(x, y, w, h, on_tap, on_hold)
        local function safe(fn)
            return fn and function()
                local ok, err = pcall(fn)
                if not ok then logger.warn("Lexeme: Vocabulary Builder", err) end
            end
        end
        return hit(self, x, y, w, h, safe(on_tap), safe(on_hold))
    end
end

local SCALE = 1272 / 1236

-- Paperwhite 5 pixels, scaled to this screen.
function UI.P(n)
    return D.s(n * SCALE)
end

-- A face `px` Paperwhite 5 pixels high.
function UI.F(kind, px)
    return D.face(kind, px * SCALE)
end

local P, F = UI.P, UI.F

UI.GRAY = D.gray(153) -- what can't be tapped

-- "2,072"
function UI.count(n)
    local text = tostring(math.floor(n or 0))
    local result = text:reverse():gsub("(%d%d%d)", "%1,"):reverse()
    return (result:gsub("^,", ""))
end

-- A solid triangle in the w x h box, pointing "left", "right" or "down".
function UI.triangle(bb, x, y, w, h, direction, color)
    color = color or D.BLACK
    if direction == "down" then
        for row = 0, h - 1 do
            local inset = math.floor(row * w / (2 * h) + 0.5)
            bb:paintRect(x + inset, y + row, math.max(1, w - 2 * inset), 1, color)
        end
        return
    end
    for col = 0, w - 1 do
        local inset = math.floor(col * h / (2 * w) + 0.5)
        local cx = direction == "right" and x + col or x + w - 1 - col
        bb:paintRect(cx, y + inset, 1, math.max(1, h - 2 * inset), color)
    end
end

-- A line `thickness` wide from x0, y0 to x1, y1.
function UI.line(bb, x0, y0, x1, y1, thickness, color)
    local steps = math.max(1, math.abs(x1 - x0), math.abs(y1 - y0))
    local half = thickness / 2
    for i = 0, steps do
        local x = x0 + (x1 - x0) * i / steps
        local y = y0 + (y1 - y0) * i / steps
        bb:paintRect(math.floor(x - half + 0.5), math.floor(y - half + 0.5), thickness, thickness, color or D.BLACK)
    end
end

-- A chevron (‹ or ›) filling the w x h box.
function UI.chevron(bb, x, y, w, h, direction, thickness, color)
    local half = thickness / 2
    local tip = direction == "right" and x + w - half or x + half
    local tail = direction == "right" and x + half or x + w - half
    UI.line(bb, tail, y + half, tip, y + h / 2, thickness, color)
    UI.line(bb, tip, y + h / 2, tail, y + h - half, thickness, color)
end

function UI.check(bb, x, y, w, h, thickness)
    UI.line(bb, x + thickness / 2, y + h * 0.52, x + w * 0.34, y + h - thickness / 2, thickness)
    UI.line(bb, x + w * 0.34, y + h - thickness / 2, x + w - thickness / 2, y + thickness / 2, thickness)
end

-- A label with ▼ after it, its right edge at `right`; tapping it calls `on_tap`. Returns its left edge.
function UI.dropdownLabel(view, bb, right, label, on_tap)
    local face = F("bold", 37)
    local triangle_x = right - P(24)
    UI.triangle(bb, triangle_x, P(254), P(25), P(18), "down")
    local text_w = D.width(face, label)
    local left = triangle_x - P(16) - text_w
    D.text(bb, left, P(273), face, label)
    view:hit(left - P(16), P(222), right - left + P(40), P(74), on_tap)
    return left
end

-- Dropdown ---------------------------------------------------------------------------------

-- The list a ▼ opens: { text, checked, callback } items, a check by the chosen one.
local Dropdown = View:extend{
    items = nil,
    right = nil,
    top = nil,
}
UI.Dropdown = Dropdown

function Dropdown:init()
    self.face = F("regular", 42)
    local text_w = 0
    for _, item in ipairs(self.items) do text_w = math.max(text_w, D.width(self.face, item.text)) end
    local w = P(47) + text_w + P(67) + P(54) + P(41)
    local h = P(81) * 2 + (#self.items - 1) * P(126)
    local x = math.max(0, self.right - w)
    local y = math.min(self.top, Screen:getHeight() - h)
    self.region = Geom:new{ x = x, y = y, w = w, h = h }
    View.init(self)
end

function Dropdown:render(bb, x, y, w, h)
    D.border(bb, x, y, w, h, P(3), D.gray(85))
    for i, item in ipairs(self.items) do
        local baseline = y + P(81) + (i - 1) * P(126)
        D.text(bb, x + P(47), baseline, self.face, item.text)
        if item.checked then UI.check(bb, x + w - P(95), baseline - P(38), P(54), P(38), P(4)) end
        self:pressable(x, baseline - P(70), w, P(126), function()
            self:close()
            UIManager:nextTick(item.callback)
        end, { x = x + P(8), y = baseline - P(66), w = w - P(16), h = P(110) })
    end
end

-- A sentence with the word in bold -----------------------------------------------------------

local function lower(text)
    return Utf8Proc.lowercase(text)
end

-- The sentence's words, each split around the looked-up word where it holds it.
local function tokens(sentence, word)
    local list, target = {}, lower(word or "")
    for token in sentence:gmatch("%S+") do
        local lowered = lower(token)
        local s, e = nil, nil
        if target ~= "" and #lowered == #token then s, e = lowered:find(target, 1, true) end
        if s then
            table.insert(list, { pre = token:sub(1, s - 1), word = token:sub(s, e), post = token:sub(e + 1) })
        else
            table.insert(list, { pre = token })
        end
    end
    return list
end

local function tokenWidth(t, face, bold)
    return D.width(face, t.pre) + (t.word and D.width(bold, t.word) + D.width(face, t.post) or 0)
end

local function wrapTokens(list, first, face, bold, width)
    local lines, line, line_w = {}, {}, 0
    local space = D.width(face, " ")
    for i = first, #list do
        local tw = tokenWidth(list[i], face, bold)
        if #line > 0 and line_w + space + tw > width then
            table.insert(lines, line)
            line, line_w = {}, 0
        end
        line_w = line_w + (#line > 0 and space or 0) + tw
        table.insert(line, list[i])
    end
    if #line > 0 then table.insert(lines, line) end
    return lines
end

--[[
Lays the sentence out in at most `max_lines` lines `width` wide. When the word would fall past the
last line, the sentence starts a little before it, after "…"; when it runs on, it ends in "…".
]]
function UI.usageLines(sentence, word, face, bold, width, max_lines)
    local list = tokens(sentence or "", word)
    if #list == 0 then return {} end
    local word_at
    for i, t in ipairs(list) do
        if t.word then
            word_at = i
            break
        end
    end
    local first = 1
    local lines = wrapTokens(list, first, face, bold, width)
    local function lineOf(index)
        local seen = first - 1
        for n, line in ipairs(lines) do
            seen = seen + #line
            if index <= seen then return n end
        end
    end
    while word_at and first < word_at and lineOf(word_at) > max_lines do
        first = first + 1
        lines = wrapTokens(list, first, face, bold, width)
    end
    if first > 1 then table.insert(lines[1], 1, { pre = "…" }) end
    if #lines > max_lines then
        for i = #lines, max_lines + 1, -1 do lines[i] = nil end
        local last = lines[max_lines]
        local ellipsis = D.width(face, "…")
        local function lineWidth(line)
            local w = 0
            for i, t in ipairs(line) do w = w + tokenWidth(t, face, bold) + (i > 1 and D.width(face, " ") or 0) end
            return w
        end
        while #last > 1 and lineWidth(last) + ellipsis > width do table.remove(last) end
        local tail = last[#last]
        last[#last] = { pre = tail.pre, word = tail.word, post = (tail.post or "") .. "…" }
        if not tail.word then last[#last] = { pre = tail.pre .. "…" } end
    end
    return lines
end

function UI.paintUsage(bb, x, baseline, pitch, lines, face, bold, right)
    local space = D.width(face, " ")
    for n, line in ipairs(lines) do
        local cx = x
        local y = baseline + math.floor((n - 1) * pitch + 0.5)
        if right then
            local w = 0
            for i, t in ipairs(line) do w = w + tokenWidth(t, face, bold) + (i > 1 and space or 0) end
            cx = right - w
        end
        for _, t in ipairs(line) do
            cx = cx + D.text(bb, cx, y, face, t.pre)
            if t.word then
                cx = cx + D.text(bb, cx, y, bold, t.word)
                cx = cx + D.text(bb, cx, y, face, t.post)
            end
            cx = cx + space
        end
    end
end

-- Dictionary entries ------------------------------------------------------------------------

local found = {}

local css = {}

-- What KOReader's dictionary adds to a result before showing it, for HTML dictionaries.
local function prepared(result)
    local dictionary = Languages.dictionary(result.dict)
    if not (dictionary and dictionary.is_html) then return result end
    result.is_html = true
    local base = dictionary.file:gsub("%.ifo$", "")
    if css[base] == nil then
        local f = io.open(base .. ".css", "r")
        css[base] = f and f:read("*all") or false
        if f then f:close() end
    end
    result.css = css[base] or nil
    local res = dictionary.file:match("^(.*/)") .. "res"
    if lfs.attributes(res, "mode") == "directory" then result.dictionary_resource_directory = res end
    return result
end

-- Looks the word up in its language's dictionaries (the word as read, then its headword), and
-- calls `on_found(results)`, from a cache after the first time.
function UI.lookUp(ui, entry, on_found)
    if found[entry.id] then return on_found(found[entry.id]) end
    local dictionary = ui and ui.dictionary
    if not dictionary then return on_found({}) end
    UIManager:nextTick(function()
        Trapper:wrap(function()
            local names = Languages.dictionaries(entry.lang, dictionary.enabled_dict_names)
            if #names == 0 then names = nil end
            local results = {}
            for _, word in ipairs({ entry.word, entry.stem }) do
                if word and #results == 0 then
                    for _, result in ipairs(dictionary:startSdcv(word, names, false) or {}) do
                        if not result.no_result and result.dict ~= "" then table.insert(results, prepared(result)) end
                    end
                end
            end
            found[entry.id] = results
            on_found(results)
        end)
    end)
end

-- An HtmlBoxWidget with the first dictionary's entries for the word.
function UI.entriesWidget(entry, results, w, h, size)
    local dict = results[1].dict
    local html = HtmlBoxWidget:new{ dimen = Geom:new{ w = w, h = h } }
    html:setContent(Definition.entries(entry.word, results, dict), (results[1].css or "") .. Definition.CSS,
        size, false, nil, results[1].dictionary_resource_directory)
    return html
end

-- The word card ----------------------------------------------------------------------------

local DICTIONARY = 1 -- then Usage
local SLOTS = 3

-- A word's Dictionary and Usage tabs over the grid, with Delete and Mastered.
local Card = View:extend{
    ui = nil,
    entry = nil,
    on_change = nil, -- after the word is deleted or moved between Learning and Mastered
}
UI.Card = Card

function Card:init()
    self.region = Geom:new{ x = P(63), y = P(382), w = P(1120), h = P(1037) }
    View.init(self)
    self.covers_fullscreen = false
    self.tab = DICTIONARY
    self.page = 1
    self.usages = Vocabulary.usages(self.entry.id)
    UI.lookUp(self.ui, self.entry, function(results)
        if self.closed then return end
        self.results = results
        self:refresh()
    end)
end

function Card:close(refresh)
    self.closed = true
    if self.html then self.html:free() end
    View.close(self, refresh)
end

function Card:render(bb, x, y, w, h)
    D.rect(bb, x, y, w, h, D.WHITE)
    D.border(bb, x, y, w, h, P(5), D.BLACK, P(8))
    self:paintTabs(bb, x, y, w)
    D.rect(bb, x + P(36), y + P(904), P(1047), P(1))
    if self.tab == DICTIONARY then self:paintDictionary(bb, x, y) else self:paintUsage(bb, x, y) end
    self:paintButtons(bb, x, y, w, h)
end

function Card:paintTabs(bb, x, y, w)
    local half = P(560)
    local edge = P(6)
    if self.tab == DICTIONARY then
        D.rect(bb, x + half - P(6), y, edge, P(110))
        D.rect(bb, x + half - P(6), y + P(104), w - half + P(6), edge)
    else
        D.rect(bb, x + half, y, edge, P(110))
        D.rect(bb, x, y + P(104), half + edge, edge)
    end
    for i, label in ipairs({ "Dictionary", "Usage" }) do
        local cx = x + (i == 1 and P(280) or P(838))
        D.textCenter(bb, cx, y + P(71), F(i == self.tab and "bold" or "regular", 46), label)
        if i ~= self.tab then
            self:hit(x + (i == 1 and 0 or half), y, i == 1 and half or w - half, P(110), function()
                self.tab, self.page = i, 1
                self:refresh()
            end)
        end
    end
end

-- "2/3" at the bottom right of the content when it runs to more pages.
function Card:paintPages(bb, x, y, pages)
    self.pages = pages
    if pages <= 1 then return end
    D.textRight(bb, x + P(1066), y + P(890), F("regular", 29), self.page .. "/" .. pages, UI.GRAY)
end

function Card:paintDictionary(bb, x, y)
    local face = F("regular", 37)
    if not self.results then
        D.text(bb, x + P(51), y + P(190), face, "Searching Dictionary…")
        return self:paintPages(bb, x, y, 1)
    end
    if #self.results == 0 then
        D.text(bb, x + P(51), y + P(190), face, "No definition found for “" .. self.entry.word .. "”.", D.BLACK,
            P(1000))
        return self:paintPages(bb, x, y, 1)
    end
    if not self.html then self.html = UI.entriesWidget(self.entry, self.results, P(1032), P(740), P(37)) end
    self.html:setPageNumber(self.page)
    self.html:paintTo(bb, x + P(51), y + P(140))
    self:paintPages(bb, x, y, self.html.page_count or 1)
end

function Card:paintUsage(bb, x, y)
    local face, bold = F("regular", 37), F("bold", 37)
    local pages = math.max(1, math.ceil(#self.usages / SLOTS))
    self.page = math.min(self.page, pages)
    local first = (self.page - 1) * SLOTS + 1
    for slot = 0, SLOTS - 1 do
        local usage = self.usages[first + slot]
        if not usage then break end
        local top = y + P(109) + slot * P(265)
        local sentence = usage.usage ~= "" and usage.usage or self.entry.word
        local lines = UI.usageLines(sentence, self.entry.word, face, bold, P(992), 3)
        UI.paintUsage(bb, x + P(61), top + P(71), P(47.5), lines, face, bold)
        if usage.title then
            D.textRight(bb, x + P(1066), top + P(224), F("regular", 29), D.fit(F("regular", 29), usage.title, P(998)))
        end
        if slot < SLOTS - 1 and self.usages[first + slot + 1] then
            D.rect(bb, x + P(36), top + P(263), P(1047), P(3))
        end
    end
    self:paintPages(bb, x, y, pages)
end

function Card:paintButtons(bb, x, y, w, h)
    D.rect(bb, x + P(559), y + P(909), P(1), P(118))
    local mastered = self.entry.mastered
    local buttons = {
        { label = "Delete", tap = function() self:confirmDelete() end },
        { label = mastered and "Learning" or "Mastered", tap = function()
            Vocabulary.setMastered(self.entry.id, not mastered)
            self:close()
            if self.on_change then self.on_change() end
        end },
    }
    for i, button in ipairs(buttons) do
        local left = x + (i == 1 and P(5) or P(560))
        local bw = i == 1 and P(554) or w - P(565)
        -- Centred between the ends of the line above them, as Amazon's are.
        D.textCenter(bb, x + (i == 1 and P(298) or P(822)), y + P(985), F("bold", 46), button.label)
        self:pressable(left, y + P(905), bw, h - P(910), button.tap,
            { x = left + P(10), y = y + P(915), w = bw - P(20), h = h - P(930), radius = P(8) })
    end
end

function Card:confirmDelete()
    Dialog:new{
        title = "Delete Word?",
        message = "“" .. self.entry.word .. "” and the sentences it was read in will be removed from "
            .. "Vocabulary Builder.",
        ok_text = "Delete",
        on_ok = function()
            Vocabulary.delete(self.entry.id)
            self:close()
            if self.on_change then self.on_change() end
        end,
    }:show()
end

function Card:onSwipe(direction)
    if not self.pages or self.pages <= 1 then return true end
    local page = self.page + (direction == "north" and 1 or direction == "south" and -1 or 0)
    page = math.max(1, math.min(self.pages, page))
    if page ~= self.page then
        self.page = page
        if self.html then self.html:freeBb() end
        self:refresh()
    end
    return true
end

-- About Vocabulary Builder -----------------------------------------------------------------

local ABOUT = {
    "Vocabulary Builder helps you learn new words while you read.",
    "",
    "Words that you look up in the dictionary while you read automatically appear here, sorted by "
        .. "language. You can then view Flashcards or review usage examples for those words.",
    "",
    "To turn it off, go to Settings, Reading Options and Vocabulary Builder.",
}

local About = View:extend{}
UI.About = About

function About:init()
    self.face = F("regular", 42)
    self.lines = {}
    for _, paragraph in ipairs(ABOUT) do
        if paragraph == "" then
            table.insert(self.lines, "")
        else
            for _, line in ipairs(D.wrap(self.face, paragraph, P(900), 20)) do table.insert(self.lines, line) end
        end
    end
    local h = P(317) + #self.lines * P(52)
    self.region = Geom:new{ x = P(109), y = math.floor((Screen:getHeight() - h) / 2), w = P(1017), h = h }
    View.init(self)
    self.covers_fullscreen = false
end

function About:render(bb, x, y, w, h)
    D.border(bb, x, y, w, h, P(5), D.BLACK, P(8))
    D.text(bb, x + P(36), y + P(72), F("bold", 46), "About Vocabulary Builder")
    D.rect(bb, x, y + P(112), w, P(4))
    for i, line in ipairs(self.lines) do
        D.text(bb, x + P(53), y + P(186) + (i - 1) * P(52), self.face, line)
    end
    local separator = y + P(186) + #self.lines * P(52)
    D.rect(bb, x + P(36), separator, w - P(72), P(1))
    D.textCenter(bb, x + math.floor(w / 2), separator + P(80), F("bold", 46), "OK")
    self:pressable(x, separator, w, y + h - separator, function() self:close() end,
        { x = x + P(20), y = separator + P(10), w = w - P(40), h = y + h - separator - P(25), radius = P(8) })
end

UI.guard(Dropdown)
UI.guard(Card)
UI.guard(About)

return UI
