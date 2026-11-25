--[[
The bordered dropdown used by every ⋮ button. Items are
{ text = ..., callback = ..., enabled = true, more = { items } }; `"-"` draws a separator.
An item with `more` gets its own ⋮ that opens those items.
]]
local Geom = require("ui/geometry")
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local View = require("lexeme/view")

local Menu = View:extend{
    items = nil,
    right = nil, -- right edge of the box, or:
    left = nil,
    top = nil, -- top edge of the box, or:
    bottom = nil,
}

-- Baselines and separator offsets from the top of the box, in reference pixels.
local function layout(items)
    local rows, y = {}, 95
    for i, item in ipairs(items) do
        if item == "-" then
            local line = y + 71
            table.insert(rows, { separator = line })
            y = line + 93
        else
            table.insert(rows, { item = item, baseline = y })
            if items[i + 1] and items[i + 1] ~= "-" then y = y + 103.5 end
        end
    end
    return rows, y + 76
end

function Menu:init()
    self.face = D.face("regular", 36)
    local text_w, more_w = 0, 0
    for _, item in ipairs(self.items) do
        if item ~= "-" then text_w = math.max(text_w, D.width(self.face, item.text)) end
        if item ~= "-" and item.more then more_w = D.s(80) end
    end
    local rows, height = layout(self.items)
    self.rows = rows
    local w = math.max(text_w + more_w + D.s(132), D.s(440))
    local h = D.s(height)
    self.region = Geom:new{ x = self.left or (self.right - w), y = self.top or (self.bottom - h), w = w, h = h }
    View.init(self)
end

function Menu:render(bb, x, y, w, h)
    D.border(bb, x, y, w, h, D.s(5))
    for _, row in ipairs(self.rows) do
        if row.separator then
            D.rect(bb, x, y + D.s(row.separator), w, D.s(4))
        else
            local item = row.item
            local enabled = item.enabled ~= false
            local baseline = y + D.s(row.baseline)
            D.text(bb, x + D.s(66), baseline, self.face, item.text, enabled and D.BLACK or D.gray(136))
            if enabled then
                self:pressable(x, baseline - D.s(70), w, D.s(103), function()
                    self:close()
                    UIManager:nextTick(item.callback)
                end, { x = x + D.s(34), y = baseline - D.s(62), w = w - D.s(68) })
                if item.more then self:paintMore(bb, x + w, baseline, item.more) end
            end
        end
    end
end

function Menu:paintMore(bb, right, baseline, items)
    D.icon(bb, "ellipsis-vertical", right - D.s(86), baseline - D.s(34), D.s(40), D.s(40))
    self:hit(right - D.s(126), baseline - D.s(70), D.s(126), D.s(103), function()
        self:close()
        UIManager:nextTick(function()
            Menu:new{ items = items, right = right - D.s(40), top = baseline - D.s(20) }:show()
        end)
    end)
end

return Menu
