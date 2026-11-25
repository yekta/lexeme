--[[
Base for every Lexeme screen and panel. A view paints itself in `render` and
registers tap targets with `hit` while painting, so what you see is what you
can tap.
]]
local Geom = require("ui/geometry")
local GestureRange = require("ui/gesturerange")
local InputContainer = require("ui/widget/container/inputcontainer")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")

local View = InputContainer:extend{
    -- Geom of the painted area; nil covers the whole screen.
    region = nil,
    -- A view that takes every tap; tapping outside its region closes it. (Not
    -- `modal`: KOReader stacks modal windows above anything shown later.)
    takes_all_taps = true,
    background = D.WHITE,
}

function View:init()
    local full = Geom:new{ x = 0, y = 0, w = Screen:getWidth(), h = Screen:getHeight() }
    self.dimen = self.region or full
    self.covers_fullscreen = self.region == nil
    self.hits = {}
    local range = self.takes_all_taps and full or self.dimen
    self.ges_events = {
        LexemeTap = { GestureRange:new{ ges = "tap", range = range } },
        LexemeHold = { GestureRange:new{ ges = "hold", range = range } },
        LexemeSwipe = { GestureRange:new{ ges = "swipe", range = range } },
    }
end

function View:paintTo(bb)
    self.hits = {}
    local r = self.dimen
    if self.background then D.rect(bb, r.x, r.y, r.w, r.h, self.background) end
    self:render(bb, r.x, r.y, r.w, r.h)
end

function View:render() end

-- Registers a tap target; later registrations win when targets overlap.
function View:hit(x, y, w, h, on_tap, on_hold)
    table.insert(self.hits, { x = x, y = y, w = w, h = h, tap = on_tap, hold = on_hold })
end

-- A tap target that shows itself pressed when tapped, as on the Kindle. `pressed` ({ x, y, w, h },
-- each defaulting to the target's) is inverted, with `radius` corners, or gets a black `outline`
-- that thick, or is drawn by `paint(bb)`.
function View:pressable(x, y, w, h, on_tap, pressed)
    pressed = pressed or {}
    self:hit(x, y, w, h, on_tap)
    self.hits[#self.hits].pressed = {
        x = pressed.x or x, y = pressed.y or y, w = pressed.w or w, h = pressed.h or h,
        radius = pressed.radius, outline = pressed.outline, paint = pressed.paint,
    }
end

local function paintPressed(bb, p)
    if p.paint then return p.paint(bb) end
    if p.outline then return D.border(bb, p.x, p.y, p.w, p.h, p.outline) end
    D.invert(bb, p.x, p.y, p.w, p.h, p.radius)
end

-- As on the Kindle, the pressed look stays until the screen is next drawn, after the tap has done its work.
function View:showPressed(p)
    local region = Geom:new{ x = p.x, y = p.y, w = p.w, h = p.h }
    -- Whatever was waiting to be drawn goes first, or it would draw over the pressed look.
    UIManager:forceRePaint()
    paintPressed(Screen.bb, p)
    UIManager:setDirty(nil, "fast", region)
    UIManager:forceRePaint()
    UIManager:setDirty(self, "fast", region)
end

function View:findHit(pos)
    for i = #self.hits, 1, -1 do
        local t = self.hits[i]
        if pos.x >= t.x and pos.x < t.x + t.w and pos.y >= t.y and pos.y < t.y + t.h then
            return t
        end
    end
end

function View:isInside(pos)
    local r = self.dimen
    return pos.x >= r.x and pos.x < r.x + r.w and pos.y >= r.y and pos.y < r.y + r.h
end

function View:onLexemeTap(_, ges)
    self.last_tap = ges.pos
    local target = self:findHit(ges.pos)
    if target and target.tap then
        if target.pressed then self:showPressed(target.pressed) end
        target.tap()
        return true
    end
    if not self:isInside(ges.pos) then
        self:onTapOutside(ges)
    end
    return self.takes_all_taps
end

function View:onLexemeHold(_, ges)
    local target = self:findHit(ges.pos)
    if target and target.hold then
        target.hold()
        return true
    end
    return self.takes_all_taps
end

function View:onLexemeSwipe(_, ges)
    if not self:isInside(ges.pos) then return self.takes_all_taps end
    local handled = self:onSwipe(ges.direction, ges)
    return handled or self.takes_all_taps
end

function View:onSwipe() end

function View:onTapOutside()
    self:close()
end

function View:show(refresh)
    UIManager:show(self, refresh or "ui")
end

function View:close(refresh)
    UIManager:close(self, refresh or "ui", self.dimen)
    if self.on_close then self.on_close() end
end

function View:refresh(kind)
    UIManager:setDirty(self, kind or "ui", self.dimen)
end

return View
