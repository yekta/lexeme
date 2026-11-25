-- A full-screen text field with the Kindle keyboard, for passwords and other short input.
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Keyboard = require("lexeme/keyboard")
local Status = require("lexeme/status")
local View = require("lexeme/view")

local TextEntry = View:extend{
    title = nil,
    secret = false,
    on_done = nil,
}

function TextEntry:init()
    View.init(self)
    self.text = ""
    self.revealed = false
    self.keyboard = Keyboard.new{
        on_input = function(text)
            self.text = self.text .. text
            self:refresh("fast")
        end,
        on_backspace = function()
            self.text = self.text:gsub("[%z\1-\127\194-\244][\128-\191]*$", "")
            self:refresh("fast")
        end,
        on_enter = function() self:done() end,
    }
end

function TextEntry:done()
    self:close("flashui")
    if self.on_done then UIManager:nextTick(function() self.on_done(self.text) end) end
end

function TextEntry:render(bb, x, y, w)
    Status.paint(self, bb, x, y, w)
    D.text(bb, x + D.s(66), y + D.s(168), D.face("bold", 34), self.title or "", D.BLACK, w - D.s(250))
    D.icon(bb, "x", x + D.s(1189), y + D.s(131), D.s(52), D.s(52))
    self:pressable(x + w - D.s(120), y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(1165), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))

    local field_y = y + D.s(290)
    D.border(bb, x + D.s(66), field_y, w - D.s(132), D.s(100), D.s(2), D.BLACK, D.s(8))
    local shown = (self.secret and not self.revealed) and string.rep("•", #self.text) or self.text
    local tw = D.text(bb, x + D.s(96), field_y + D.s(64), D.face("regular", 34), shown, D.BLACK, w - D.s(400))
    D.rect(bb, x + D.s(98) + tw, field_y + D.s(28), D.s(2), D.s(44))
    if self.secret then
        local label = self.revealed and "Hide" or "Show"
        local face = D.face("regular", 30)
        local lw = D.width(face, label)
        D.text(bb, x + w - D.s(96) - lw, field_y + D.s(62), face, label)
        self:pressable(x + w - D.s(140) - lw, field_y, lw + D.s(80), D.s(100), function()
            self.revealed = not self.revealed
            self:refresh()
        end, { x = x + w - D.s(96) - lw, y = field_y + D.s(62 - 32), w = lw, h = D.s(42) })
    end

    local button_y = field_y + D.s(150)
    local bw = D.s(213)
    local bx = x + w - D.s(66) - bw
    D.roundRect(bb, bx, button_y, bw, D.s(98), D.BLACK, D.s(8))
    D.textCenter(bb, bx + bw / 2, button_y + D.s(61), D.face("regular", 32), "Done", D.WHITE)
    self:pressable(bx, button_y, bw, D.s(98), function() self:done() end,
        D.inset(bx, button_y, bw, D.s(98), D.s(3), { radius = D.s(5) }))

    self.keyboard:paint(self, bb, x, w)
end

function TextEntry.show(opts)
    UIManager:show(TextEntry:new(opts), "flashui")
end

return TextEntry
