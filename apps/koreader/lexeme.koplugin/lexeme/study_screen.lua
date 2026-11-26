--[[
Studying a deck, as on Lexeme's study page: the deck's name and how far along the
session is, a card that turns over when tapped, and the four ratings under its back.
]]
local UIManager = require("ui/uimanager")
local time = require("ui/time")

local Button = require("lexeme/button")
local D = require("lexeme/draw")
local Status = require("lexeme/status")
local Study = require("lexeme/study")
local View = require("lexeme/view")

local StudyScreen = View:extend{
    deck = nil,
}

local CARD = { x = 36, top = 262, bottom = 1452, border = 3, padding = 128 }
local BUTTONS = { top = 1480, h = 150, gap = 20 }
local RATING_LABELS = { again = "Again", hard = "Hard", good = "Good", easy = "Easy" }

local function shuffle(items)
    for i = #items, 2, -1 do
        local j = math.random(i)
        items[i], items[j] = items[j], items[i]
    end
    return items
end

-- First the cards not seen yet, in random order, as Lexeme does; then the ones coming back this session.
local function sessionQueue(cards)
    local fresh, again = {}, {}
    for _, card in ipairs(cards) do
        table.insert(card.back_at and again or fresh, card)
    end
    table.sort(again, function(a, b) return a.back_at < b.back_at end)
    shuffle(fresh)
    for _, card in ipairs(again) do table.insert(fresh, card) end
    return fresh
end

function StudyScreen:init()
    View.init(self)
    self.queue = sessionQueue(self.deck.cards)
    self.reviewed = 0
    self:showFront()
end

function StudyScreen:showFront()
    self.flipped = false
    self.shown_at = time.now()
end

function StudyScreen:current()
    return self.queue[1]
end

function StudyScreen:flip()
    self.flipped = true
    self:refresh("ui")
end

function StudyScreen:rate(rating)
    local card = table.remove(self.queue, 1)
    if not card then return end
    local preview = card.next and card.next[rating]
    -- Without a preview (the answer before it is still on its way to Lexeme), only Again brings a card back.
    local comes_back = preview and preview.interval_ms < Study.SHORT_INTERVAL_MS or (not preview and rating == "again")
    local duration_ms = time.to_ms(time.now() - self.shown_at)
    if comes_back then
        card.back_at = os.time() + math.floor((preview and preview.interval_ms or 60000) / 1000)
        card.state = card.state == "review" and "relearning" or "learning"
        card.next = nil
        self:requeue(card)
    end
    self.reviewed = self.reviewed + 1
    Study.saveQueue(self.deck.id, self.queue)
    self:showFront()
    self:refresh("ui")
    UIManager:nextTick(function()
        Study.answer(card, rating, duration_ms, function(next)
            if not comes_back then return end
            card.next = next
            Study.saveQueue(self.deck.id, self.queue)
            if self:current() == card and self.flipped then self:refresh("ui") end
        end)
    end)
end

-- After the cards not seen yet, among the others by when they're due back.
function StudyScreen:requeue(card)
    local at = #self.queue + 1
    for i, other in ipairs(self.queue) do
        if other.back_at and other.back_at > card.back_at then
            at = i
            break
        end
    end
    table.insert(self.queue, at, card)
end

function StudyScreen:onSwipe(direction)
    if direction == "east" then self:close("flashui") end
    return true
end

-- Painting -------------------------------------------------------------------------

function StudyScreen:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w)
    D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
    self:pressable(x, y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(7), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    local progress = ""
    if #self.queue > 0 then
        progress = string.format("%d / %d", self.reviewed + 1, self.reviewed + #self.queue)
    end
    local progress_w = D.width(D.face("regular", 32), progress)
    D.textRight(bb, x + w - D.s(48), y + D.s(168), D.face("regular", 32), progress)
    D.text(bb, x + D.s(139), y + D.s(168), D.face("bold", 34), self.deck.name, D.BLACK,
        w - D.s(139 + 48 + 40) - progress_w)
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))

    local card = self:current()
    if not card then return self:paintDone(bb, x, y, w) end
    self:paintCard(bb, x, y, w, card)
    if self.flipped then self:paintRatings(bb, x, y, w, card) end
end

-- Breaks text into lines no wider than `width`, keeping its own line breaks.
local function wrapLines(face, text, width)
    local lines = {}
    for paragraph in (text .. "\n"):gmatch("(.-)\n") do
        if paragraph:match("^%s*$") then
            table.insert(lines, "")
        else
            for _, line in ipairs(D.wrap(face, paragraph, width, 1000)) do table.insert(lines, line) end
        end
    end
    while lines[#lines] == "" do table.remove(lines) end
    return lines
end

-- The biggest of `sizes` whose lines fit in `height`; the smallest is cut to fit.
local function fitText(kind, sizes, text, width, height)
    local face, lines, pitch
    for _, size in ipairs(sizes) do
        face, pitch = D.face(kind, size), D.s(math.floor(size * 1.4))
        lines = wrapLines(face, text, width)
        if #lines * pitch <= height then return face, lines, pitch end
    end
    local max = math.max(1, math.floor(height / pitch))
    for i = #lines, max + 1, -1 do lines[i] = nil end
    lines[max] = D.fit(face, lines[max] .. " …", width)
    return face, lines, pitch
end

function StudyScreen:paintCard(bb, x, y, w, card)
    local cx, cy = x + D.s(CARD.x), y + D.s(CARD.top)
    local cw, ch = w - 2 * D.s(CARD.x), D.s(CARD.bottom - CARD.top)
    D.border(bb, cx, cy, cw, ch, D.s(CARD.border))
    local center = cx + math.floor(cw / 2)
    D.textCenter(bb, center, cy + D.s(78), D.face("bold", 26), self.flipped and "BACK" or "FRONT", D.gray(102))

    local text_top, text_bottom = cy + D.s(120), cy + ch - D.s(120)
    local text_w, text_h = cw - 2 * D.s(CARD.padding), text_bottom - text_top
    local face, lines, pitch
    if self.flipped then
        face, lines, pitch = fitText("serif", { 36, 32, 28, 26 }, card.back, text_w, text_h)
    else
        face, lines, pitch = fitText("serif", { 64, 52, 44, 36, 30 }, card.front, text_w, text_h)
    end
    local block = #lines * pitch
    local baseline = text_top + math.floor((text_bottom - text_top - block) / 2) + math.floor(pitch * 0.72)
    for _, line in ipairs(lines) do
        D.textCenter(bb, center, baseline, face, line)
        baseline = baseline + pitch
    end

    if self.flipped then return end
    D.textCenter(bb, center, cy + ch - D.s(60), D.face("regular", 28), "Tap to flip", D.gray(102))
    self:hit(cx, cy, cw, ch, function() self:flip() end)
end

-- Lexeme's "This session | <10m" is "<10m" here, where four buttons share the width.
local function intervalLabel(text)
    return text:match("|%s*(.+)$") or text
end

function StudyScreen:paintRatings(bb, x, y, w, card)
    local left, right = x + D.s(CARD.x), x + w - D.s(CARD.x)
    local gap, top = D.s(BUTTONS.gap), y + D.s(BUTTONS.top)
    local count = #Study.RATINGS
    -- Whole-pixel widths leave pixels over; they go between buttons so the last ends at `right`.
    local function buttonX(i) return left + math.floor(i * (right - left + gap) / count + 0.5) end
    local name_face, interval_face = D.face("bold", 34), D.face("regular", 26)
    for i, rating in ipairs(Study.RATINGS) do
        local bx = buttonX(i - 1)
        local bw = buttonX(i) - gap - bx
        Button.paint(self, bb, bx, top, { w = bw, h = BUTTONS.h, border = 3 }, function() self:rate(rating) end)
        local center = bx + math.floor(bw / 2)
        local preview = card.next and card.next[rating]
        if preview then
            D.textCenter(bb, center, top + D.s(66), name_face, RATING_LABELS[rating])
            D.textCenter(bb, center, top + D.s(112), interval_face,
                intervalLabel(preview.interval), D.gray(68))
        else
            D.textCenter(bb, center, top + D.s(87), name_face, RATING_LABELS[rating])
        end
    end
end

function StudyScreen:paintDone(bb, x, y, w)
    local center = x + math.floor(w / 2)
    local title, message
    if self.reviewed > 0 or self.deck.card_count > 0 then
        title, message = "You're all caught up!", "You have reviewed all the due cards in this deck."
    else
        title, message = "This deck is empty", "Add some cards to this deck in Lexeme to study it."
    end
    D.textCenter(bb, center, y + D.s(760), D.face("bold", 40), title)
    D.textCenter(bb, center, y + D.s(830), D.face("regular", 32), message, D.BLACK, w - D.s(120))
    local back = { label = "Back to Lexeme", size = 32, baseline = 62, pad = 120, h = 101, border = 3 }
    Button.paint(self, bb, center - math.floor(Button.width(back) / 2), y + D.s(920), back, function() self:close() end)
end

function StudyScreen.open(deck, on_close)
    UIManager:show(StudyScreen:new{ deck = deck, on_close = on_close }, "flashui")
end

return StudyScreen
