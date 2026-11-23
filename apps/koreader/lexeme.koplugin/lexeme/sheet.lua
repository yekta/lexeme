--[[
A bottom sheet over a dimmed screen, as the Kindle shows sort, filters and book
actions. Subclasses set `height` and paint their content in `renderContent`.
]]
local Screen = require("device").screen

local D = require("lexeme/draw")
local View = require("lexeme/view")

local Sheet = View:extend{
    height = 472, -- reference pixels, from the top border to the bottom of the screen
    background = false,
}

function Sheet:init()
    View.init(self)
    self.covers_fullscreen = false
end

function Sheet:sheetTop()
    return Screen:getHeight() - D.s(self.height)
end

function Sheet:render(bb, x, y, w, h)
    local top = self:sheetTop()
    D.scrim(bb, x, y, w, top - y)
    self:hit(x, y, w, top - y, function() self:close() end)
    self:hit(x, top, w, h - (top - y), function() end)
    D.rect(bb, x, top, w, h - (top - y), D.WHITE)
    D.rect(bb, x, top, w, D.s(9))
    local hw = D.s(111)
    D.icon(bb, "handle", x + math.floor((w - hw) / 2), top + D.s(41), hw, D.s(23))
    self:hit(x + math.floor((w - hw) / 2) - D.s(60), top, hw + D.s(120), D.s(90), function() self:close() end)
    self:renderContent(bb, x, top, w, h - (top - y))
end

function Sheet:renderContent() end

function Sheet:close(refresh)
    View.close(self, refresh or "ui")
end

-- A rounded chip; selected chips are filled black. Returns its width.
function Sheet.chip(view, bb, x, y, label, selected, enabled, on_tap)
    local face = D.face("regular", 32)
    local w = D.width(face, label) + D.s(66)
    local h = D.s(79)
    local color = enabled == false and D.gray(150) or D.BLACK
    if selected then
        D.roundRect(bb, x, y, w, h, D.BLACK, D.s(39))
    else
        D.border(bb, x, y, w, h, D.s(2), color, D.s(39))
    end
    D.text(bb, x + D.s(33), y + D.s(51), face, label, selected and D.WHITE or color)
    if enabled ~= false and on_tap then view:hit(x, y, w, h, on_tap) end
    return w
end

return Sheet
