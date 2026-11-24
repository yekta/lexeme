-- How the Kindle marks selected text: a bracket from a handle above its start to a handle
-- below its end, a line under every selected line, and bars in both margins beside them.
local Screen = require("device").screen
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

function Marks:paintTo(bb, x, y)
    local selected = self.ui.highlight and self.ui.highlight.selected_text
    if not (selected and selected.sboxes and #selected.sboxes > 0) then return end
    local sboxes = selected.sboxes
    if self.ui.paging then
        local page = selected.pos0 and selected.pos0.page or self.ui.view.state.page
        sboxes = {}
        for _, box in ipairs(selected.sboxes) do
            table.insert(sboxes, self.ui.view:pageToScreenTransform(page, box))
        end
    end
    local boxes = lines(sboxes)
    if #boxes == 0 then return end
    local first, last = boxes[1], boxes[#boxes]
    -- crengine's word boxes reach a pixel past the Kindle's on either side.
    local start_x, end_x = x + first.x + 1, x + last.x + last.w - 2
    local top, bottom = y + first.y, y + last.y + last.h - 1
    local bar, underline, handle = D.s(BAR), D.s(UNDERLINE), D.s(HANDLE)

    for i, box in ipairs(boxes) do
        local left = i == 1 and start_x - D.s(3) or x + box.x
        local right = i == #boxes and end_x + D.s(2) or x + box.x + box.w - 1
        D.rect(bb, left, y + box.y + box.h, right - left + 1, underline)
    end

    local start_bottom = y + first.y + first.h + underline - 1
    local handle_top_y = top - D.s(14)
    D.rect(bb, start_x - D.s(3), handle_top_y, bar, start_bottom - handle_top_y + 1)
    D.icon(bb, "selection-handle", start_x - D.s(1) - math.floor(handle / 2), handle_top_y - math.floor(handle / 2),
        handle, handle)

    local handle_bottom_y = bottom + D.s(20)
    D.rect(bb, end_x - D.s(2), y + last.y - D.s(1), bar, handle_bottom_y - (y + last.y - D.s(1)) + 1)
    D.icon(bb, "selection-handle", end_x - math.floor(handle / 2), handle_bottom_y - math.floor(handle / 2),
        handle, handle)

    local bar_w = D.s(MARGIN_BAR_W)
    D.rect(bb, D.s(MARGIN_BAR_X), top, bar_w, bottom - top + 1)
    D.rect(bb, Screen:getWidth() - D.s(MARGIN_BAR_X) - bar_w, top, bar_w, bottom - top + 1)
end

return Marks
