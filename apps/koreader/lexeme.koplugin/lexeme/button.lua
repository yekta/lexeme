-- The Kindle's outlined button: a border around a centred label, inverted inside the border while pressed.
local D = require("lexeme/draw")

local Button = {}

local function labelFace(o)
    return D.face(o.bold and "bold" or "regular", o.size)
end

-- A button's width: its label's and `o.pad` reference pixels beside it.
function Button.width(o)
    return D.width(labelFace(o), o.label) + D.s(o.pad)
end

-- `o` holds h, border, radius, and the label's size, bold and baseline from the top, in reference pixels, and w in
-- screen pixels (Button.width(o) when missing). Without `label` the caller draws what's inside; without `on_tap`
-- the button is greyed out. Returns the width.
function Button.paint(view, bb, x, y, o, on_tap)
    local w, h, border = o.w or Button.width(o), D.s(o.h), D.s(o.border)
    local radius = o.radius and D.s(o.radius)
    D.border(bb, x, y, w, h, border, on_tap and D.BLACK or D.gray(170), radius)
    if o.label then
        D.textCenter(bb, x + w / 2, y + D.s(o.baseline), labelFace(o), o.label, on_tap and D.BLACK or D.gray(136))
    end
    if not on_tap then return w end
    view:pressable(x, y, w, h, on_tap, D.inset(x, y, w, h, border, { radius = radius and radius - border }))
    return w
end

return Button
