-- How the Kindle marks selected text: a bracket from a handle above its start to a handle
-- below its end, a line under every selected line, and bars in both margins beside them.
-- While the finger that selected it is still down, only the lines and the bars.
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")

local D = require("lexeme/draw")

local Marks = WidgetContainer:extend{
    ui = nil,
}

local BAR, UNDERLINE, HANDLE = 5, 6, 27
local MARGIN_BAR_W, MARGIN_BAR_X = 14, 15

-- One box per line, top to bottom.
local function lines(boxes)
    local sorted = {}
    for _, box in ipairs(boxes) do
        if box.w > 0 and box.h > 0 then table.insert(sorted, box) end
    end
    table.sort(sorted, function(a, b)
        if math.abs(a.y - b.y) > a.h / 2 then return a.y < b.y end
        return a.x < b.x
    end)
    local merged = {}
    for _, box in ipairs(sorted) do
        local last = merged[#merged]
        if last and math.abs(last.y - box.y) <= last.h / 2 then
            local right = math.max(last.x + last.w, box.x + box.w)
            last.x = math.min(last.x, box.x)
            last.w = right - last.x
        else
            table.insert(merged, { x = box.x, y = box.y, w = box.w, h = box.h })
        end
    end
    return merged
end

local function selectedLines(ui)
    local selected = ui.highlight and ui.highlight.selected_text
    if not (selected and selected.sboxes and #selected.sboxes > 0) then return end
    local sboxes = selected.sboxes
    if ui.paging then
        local page = selected.pos0 and selected.pos0.page or ui.view.state.page
        sboxes = {}
        for _, box in ipairs(selected.sboxes) do
            table.insert(sboxes, ui.view:pageToScreenTransform(page, box))
        end
    end
    local boxes = lines(sboxes)
    if #boxes > 0 then return boxes end
end

-- Refreshes the rows the marks take, margins included; KOReader only refreshes the words.
function Marks.refresh(ui)
    local boxes = selectedLines(ui)
    if not boxes then return end
    local last = boxes[#boxes]
    local top = boxes[1].y - D.s(14) - D.s(HANDLE)
    local bottom = last.y + last.h + D.s(20) + D.s(HANDLE)
    UIManager:setDirty(ui.dialog, "ui", Geom:new{ x = 0, y = top, w = Screen:getWidth(), h = bottom - top })
end

function Marks:paintTo(bb, x, y)
    local boxes = selectedLines(self.ui)
    if not boxes then return end
    local first, last = boxes[1], boxes[#boxes]
    -- crengine's word boxes reach a pixel past the Kindle's on either side.
    local start_x, end_x = x + first.x + 1, x + last.x + last.w - 2
    local top, bottom = y + first.y, y + last.y + last.h - 1
    local bar, underline, handle = D.s(BAR), D.s(UNDERLINE), D.s(HANDLE)
    local holding = self.ui.highlight.lexeme_holding

    for i, box in ipairs(boxes) do
        local left = i == 1 and start_x - (holding and 0 or D.s(3)) or x + box.x
        local right = i == #boxes and end_x + (holding and 0 or D.s(2)) or x + box.x + box.w - 1
        D.rect(bb, left, y + box.y + box.h, right - left + 1, underline)
    end

    local bar_w = D.s(MARGIN_BAR_W)
    D.rect(bb, D.s(MARGIN_BAR_X), top, bar_w, bottom - top + 1)
    D.rect(bb, Screen:getWidth() - D.s(MARGIN_BAR_X) - bar_w, top, bar_w, bottom - top + 1)
    if holding then return end

    local start_bottom = y + first.y + first.h + underline - 1
    local handle_top_y = top - D.s(14)
    D.rect(bb, start_x - D.s(3), handle_top_y, bar, start_bottom - handle_top_y + 1)
    D.icon(bb, "selection-handle", start_x - D.s(1) - math.floor(handle / 2), handle_top_y - math.floor(handle / 2),
        handle, handle)

    local handle_bottom_y = bottom + D.s(20)
    D.rect(bb, end_x - D.s(2), y + last.y - D.s(1), bar, handle_bottom_y - (y + last.y - D.s(1)) + 1)
    D.icon(bb, "selection-handle", end_x - math.floor(handle / 2), handle_bottom_y - math.floor(handle / 2),
        handle, handle)
end

return Marks
