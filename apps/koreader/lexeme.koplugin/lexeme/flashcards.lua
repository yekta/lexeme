--[[
Flashcards, as Amazon's: a card with the word and the sentence it was read in, turned over for its
dictionary entry. The cards are the words shown when they were opened, in that order.
]]
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Status = require("lexeme/status")
local UI = require("lexeme/vocabulary_ui")
local View = require("lexeme/view")
local Vocabulary = require("lexeme/vocabulary")

local P, F = UI.P, UI.F

local Flashcards = View:extend{
    ui = nil,
    deck = nil,
    on_close = nil,
}

-- The card, its border and the corner folded over on its front.
local CARD_X, CARD_Y, CARD_W, CARD_H = 172, 536, 889, 695
local BORDER, CUT = 4, 46

function Flashcards:init()
    View.init(self)
    self.index = 1
    self.back = false
    self.mastered = 0
    self.usages = {}
    self.results = {}
end

function Flashcards:close()
    if self.html then self.html:free() end
    self.closed = true
    View.close(self, "flashui")
    if self.on_close then self.on_close() end
end

function Flashcards:render(bb, x, y, w)
    Status.paint(self, bb, x, y, w)
    UI.chevron(bb, P(69), P(128), P(17), P(29), "left", P(3))
    D.text(bb, P(109), P(157), F("regular", 42), "Exit Flashcards")
    self:pressable(0, P(95), P(440), P(88), function() self:close() end,
        { x = P(50), y = P(108), w = P(360), h = P(66), radius = P(6) })
    D.textRight(bb, P(1171), P(157), F("regular", 42), "Words mastered: " .. self.mastered)
    D.rect(bb, 0, P(183), w, P(3))
    if #self.deck == 0 then
        D.textCenter(bb, math.floor(w / 2), P(880), F("regular", 42), "You've gone through every card.")
        return
    end
    self:paintCard(bb)
    local can_back, can_next = self.index > 1, self.index < #self.deck
    UI.chevron(bb, P(67), P(849), P(54), P(77), "left", P(9), can_back and D.BLACK or UI.GRAY)
    UI.chevron(bb, P(1116), P(849), P(54), P(77), "right", P(9), can_next and D.BLACK or UI.GRAY)
    if can_back then self:hit(0, P(700), P(CARD_X), P(380), function() self:go(-1) end) end
    if can_next then self:hit(P(CARD_X + CARD_W + 3), P(700), w, P(380), function() self:go(1) end) end
end

function Flashcards:paintFrame(bb)
    local x, y, w, h = P(CARD_X), P(CARD_Y), P(CARD_W), P(CARD_H)
    local t, cut = P(BORDER), P(CUT)
    D.rect(bb, x + t, y + h, w, P(3), D.gray(85))
    -- The shadow starts below the cut corner on the back.
    local shadow_top = self.back and y + cut or y + t
    D.rect(bb, x + w, shadow_top, P(3), y + h - shadow_top, D.gray(85))
    D.rect(bb, x, y + h - t, w, t)
    if self.back then
        -- Turned over, the fold is at the top right.
        D.rect(bb, x, y, w - cut, t)
        D.rect(bb, x, y, t, h)
        D.rect(bb, x + w - t, y + cut, t, h - cut)
        UI.line(bb, x + w - cut, y + t / 2, x + w - t / 2, y + cut, t)
    else
        D.rect(bb, x + cut, y, w - cut, t)
        D.rect(bb, x, y + cut, t, h - cut)
        D.rect(bb, x + w - t, y, t, h)
        UI.line(bb, x + t / 2, y + cut, x + cut, y + t / 2, t)
        D.rect(bb, x + P(47), y, t, P(51))
        D.rect(bb, x, y + P(48), P(51), t)
    end
end

function Flashcards:paintCard(bb)
    local entry = self.deck[self.index]
    local x, y, w = P(CARD_X), P(CARD_Y), P(CARD_W)
    self:paintFrame(bb)
    local face, bold = F("regular", 37), F("bold", 37)
    D.text(bb, P(243), P(587), face, self.back and "See Usage" or "See Definition")
    -- Tapping the card above the button turns it over.
    self:hit(x, y, w, P(1109) - y, function() self:flip() end)
    if self.back then
        self:paintDefinition(bb, entry)
    else
        D.textRight(bb, P(1031), P(587), face, self.index .. "/" .. #self.deck)
        D.textCenter(bb, P(616), P(677), F("bold", 58), entry.word, D.BLACK, P(800))
        D.rect(bb, P(187), P(704), P(862), P(1))
        local usage = self:usage(entry)
        local lines = UI.usageLines(usage.usage ~= "" and usage.usage or entry.word, entry.word, face, bold, P(788), 5)
        UI.paintUsage(bb, P(243), P(776), P(47), lines, face, bold)
        if usage.title then D.text(bb, P(242), P(1068), F("regular", 29), usage.title, D.BLACK, P(790)) end
    end
    D.rect(bb, P(187), P(1109), P(862), P(1))
    D.textCenter(bb, P(617), P(1178), bold, entry.mastered and "Mark as Learning" or "Mark as Mastered")
    self:pressable(x + P(BORDER), P(1110), w - 2 * P(BORDER), P(CARD_Y + CARD_H - BORDER - 1110),
        function() self:mark() end, { x = x + P(16), y = P(1122), w = w - P(32), h = P(90), radius = P(8) })
end

function Flashcards:usage(entry)
    if not self.usages[entry.id] then self.usages[entry.id] = Vocabulary.usages(entry.id)[1] or { usage = "" } end
    return self.usages[entry.id]
end

function Flashcards:paintDefinition(bb, entry)
    local results = self.results[entry.id]
    local face = F("regular", 37)
    self.pages = 1
    if not results then
        D.text(bb, P(231), P(690), face, "Searching Dictionary…")
        if not self.looking_up then
            self.looking_up = true
            UI.lookUp(self.ui, entry, function(found)
                self.looking_up = false
                self.results[entry.id] = found
                if not self.closed then self:refresh() end
            end)
        end
        return
    end
    if #results == 0 then
        D.text(bb, P(231), P(690), face, "No definition found for “" .. entry.word .. "”.", D.BLACK, P(800))
        return
    end
    if not self.html then
        self.html = UI.entriesWidget(entry, results, P(800), P(440), P(37))
        self.html_page = 1
    end
    self.html:setPageNumber(self.html_page)
    self.html:paintTo(bb, P(231), P(640))
    self.pages = self.html.page_count or 1
    if self.pages > 1 then
        D.textRight(bb, P(1031), P(1092), F("regular", 29), self.html_page .. "/" .. self.pages, UI.GRAY)
    end
end

function Flashcards:dropDefinition()
    if self.html then self.html:free() end
    self.html = nil
end

function Flashcards:flip()
    self.back = not self.back
    self:dropDefinition()
    self:refresh()
end

function Flashcards:go(delta)
    local index = math.max(1, math.min(#self.deck, self.index + delta))
    if index == self.index then return end
    self.index, self.back = index, false
    self:dropDefinition()
    self:refresh()
end

function Flashcards:mark()
    local entry = self.deck[self.index]
    Vocabulary.setMastered(entry.id, not entry.mastered)
    if not entry.mastered then self.mastered = self.mastered + 1 end
    table.remove(self.deck, self.index)
    self.index = math.max(1, math.min(self.index, #self.deck))
    self.back = false
    self:dropDefinition()
    self:refresh()
end

function Flashcards:onSwipe(direction)
    if self.back and self.html and (direction == "north" or direction == "south") then
        local page = self.html_page + (direction == "north" and 1 or -1)
        if page >= 1 and page <= (self.pages or 1) then
            self.html_page = page
            self.html:freeBb()
            self:refresh()
        end
    elseif direction == "west" then
        self:go(1)
    elseif direction == "east" then
        self:go(-1)
    end
    return true
end

UI.guard(Flashcards)

function Flashcards.show(ui, deck, on_close)
    UIManager:show(Flashcards:new{ ui = ui, deck = deck, on_close = on_close }, "flashui")
end

return Flashcards
