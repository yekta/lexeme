-- The Kindle's scrollbar: arrows at both ends and a dotted track whose thumb can be dragged, or
-- tapped where it should go. Scrollbar.extend(ViewClass) gives a View the gestures for it.
local GestureRange = require("ui/gesturerange")

local D = require("lexeme/draw")
local View = require("lexeme/view")

local Scrollbar = {}

--[[
Paints the bar against `right`, between top and bottom, for a view showing positions `at` to
`last` of `count`; `go(position)` shows the screen starting there.
]]
function Scrollbar.paint(view, bb, right, top, bottom, opts)
    local at, count = opts.at, math.max(1, opts.count)
    local shown = math.max(1, opts.last - at + 1)
    local pages = math.max(1, count - shown + 1)
    D.icon(bb, at > 1 and "triangle-up" or "triangle-up-gray", right - D.s(74), top + D.s(42), D.s(34), D.s(21))
    D.icon(bb, opts.last < count and "triangle-down" or "triangle-down-gray", right - D.s(75), bottom - D.s(68),
        D.s(34), D.s(21))
    local track_top, track_bottom = top + D.s(103), bottom - D.s(109)
    local track_x = right - D.s(63)
    for ty = track_top, track_bottom, D.s(4) do
        D.rect(bb, track_x + D.s(3), ty, D.s(4), D.s(2), D.gray(102))
    end
    local span = track_bottom - track_top
    local thumb_h = math.max(D.s(40), math.floor(span * shown / count))
    local thumb_y = track_top + math.floor((span - thumb_h) * (math.min(at, pages) - 1) / math.max(1, pages - 1))
    D.roundRect(bb, track_x, thumb_y, D.s(10), thumb_h, D.BLACK, D.s(5))
    if pages > 1 then
        view.scrollbar = { x = right - D.s(100), top = top + D.s(110), bottom = bottom - D.s(110), go = opts.go,
            track_top = track_top, travel = span - thumb_h, thumb_y = thumb_y, thumb_h = thumb_h, pages = pages }
        view:hit(right - D.s(100), top + D.s(110), D.s(100), bottom - top - D.s(220), function()
            Scrollbar.scrollTo(view, view.last_tap.y, Scrollbar.grab(view, view.last_tap))
        end)
    end
    view:pressable(right - D.s(100), top, D.s(100), D.s(110), function()
        if at > 1 then opts.go(at - shown) end
    end, D.around(right - D.s(57), top + D.s(52), D.s(101), D.s(101)))
    view:pressable(right - D.s(100), bottom - D.s(110), D.s(100), D.s(110), function()
        if opts.last < count then opts.go(opts.last + 1) end
    end, D.around(right - D.s(58), bottom - D.s(57), D.s(101), D.s(101)))
end

function Scrollbar.on(view, pos)
    local bar = view.scrollbar
    return bar ~= nil and pos.x >= bar.x and pos.y >= bar.top and pos.y < bar.bottom
end

-- How far below the thumb's top the finger holds it; a finger put down beside the thumb takes its middle.
function Scrollbar.grab(view, pos)
    local bar = view.scrollbar
    if pos.y >= bar.thumb_y and pos.y < bar.thumb_y + bar.thumb_h then return pos.y - bar.thumb_y end
    return math.floor(bar.thumb_h / 2)
end

-- Shows the screen whose thumb sits where the finger, holding it `grab` below its top, is at `y`.
function Scrollbar.scrollTo(view, y, grab)
    local bar = view.scrollbar
    if not bar then return end
    local position = 1 + math.floor((y - grab - bar.track_top) * (bar.pages - 1) / bar.travel + 0.5)
    bar.go(math.max(1, math.min(bar.pages, position)))
end

-- A quick drag on the bar ends as a swipe, starting where the finger went down.
function Scrollbar.onSwipe(view, ges)
    if not Scrollbar.on(view, ges.pos) then return false end
    Scrollbar.scrollTo(view, ges.end_pos.y, view.scroll_grab or Scrollbar.grab(view, ges.pos))
    view.scroll_grab = nil
    return true
end

-- Dragging the thumb: a finger that moves at once makes a pan, one that rests first a hold.
function Scrollbar.extend(class)
    local init = class.init
    class.init = function(self, ...)
        init(self, ...)
        for name, ges in pairs({ LexemePan = "pan", LexemePanRelease = "pan_release",
                LexemeHoldPan = "hold_pan", LexemeHoldRelease = "hold_release" }) do
            self.ges_events[name] = { GestureRange:new{ ges = ges, range = self.dimen } }
        end
    end

    function class:onLexemePan(_, ges)
        local start = ges.start_pos or ges.pos
        if not Scrollbar.on(self, start) then
            self.scroll_grab = nil
            return
        end
        self.scroll_grab = self.scroll_grab or Scrollbar.grab(self, start)
        Scrollbar.scrollTo(self, ges.pos.y, self.scroll_grab)
        return true
    end

    function class:onLexemePanRelease(_, ges)
        if not self.scroll_grab then return end
        Scrollbar.scrollTo(self, ges.pos.y, self.scroll_grab)
        self.scroll_grab = nil
        return true
    end

    function class:onLexemeHold(arg, ges)
        self.scroll_grab = nil
        if not Scrollbar.on(self, ges.pos) then return View.onLexemeHold(self, arg, ges) end
        self.scroll_grab = Scrollbar.grab(self, ges.pos)
        Scrollbar.scrollTo(self, ges.pos.y, self.scroll_grab)
        return true
    end

    function class:onLexemeHoldPan(_, ges)
        if not self.scroll_grab then return end
        Scrollbar.scrollTo(self, ges.pos.y, self.scroll_grab)
        return true
    end

    class.onLexemeHoldRelease = class.onLexemePanRelease
end

return Scrollbar
