-- Sliders, toggles and radio buttons, painted into a View with tap targets.
local D = require("lexeme/draw")

local C = {}

--[[
A track from x0 to x1 at centre line cy. `value` runs from min to max;
tapping the track or the -/+ buttons calls on_change with the new value.
]]
function C.slider(view, bb, opts)
    local x0, x1, cy = opts.x0, opts.x1, opts.cy
    local steps = opts.max - opts.min
    local fraction = steps > 0 and (opts.value - opts.min) / steps or 0
    local knob = opts.knob or D.s(46)
    local kx = math.floor(x0 + (x1 - x0) * fraction + 0.5)
    local thick, thin = opts.thick or D.s(6), opts.thin or D.s(2)
    -- `extend` runs the track half a knob past both ends, as the Aa panel's sliders do.
    local pad = opts.extend and math.floor(knob / 2) or 0
    D.rect(bb, x0 - pad, cy - math.floor(thick / 2), kx - x0 + pad, thick)
    D.rect(bb, kx, cy - math.floor(thin / 2), x1 - kx + pad, thin)
    D.icon(bb, "knob", kx - math.floor(knob / 2), cy - math.floor(knob / 2), knob, knob)
    if opts.label then
        D.textCenter(bb, kx, cy - math.floor(knob / 2) - D.s(17), D.face("regular", 29), tostring(opts.value))
    end
    if opts.buttons then
        local minus_x, plus_x, size = x0 - D.s(107), x1 + D.s(78), D.s(33)
        D.rect(bb, minus_x, cy - D.s(1), size, D.s(3))
        D.rect(bb, plus_x, cy - D.s(1), size, D.s(3))
        D.rect(bb, plus_x + D.s(15), cy - D.s(16), D.s(3), size)
        view:hit(minus_x - D.s(30), cy - D.s(50), D.s(84), D.s(100), function()
            if opts.value > opts.min then opts.on_change(opts.value - 1) end
        end)
        view:hit(plus_x - D.s(30), cy - D.s(50), D.s(84), D.s(100), function()
            if opts.value < opts.max then opts.on_change(opts.value + 1) end
        end)
    end
    view:hit(x0 - D.s(10), cy - D.s(45), x1 - x0 + D.s(20), D.s(90), nil)
    local target = view.hits[#view.hits]
    target.tap = function()
        local pos = view.last_tap
        if not pos then return end
        local f = math.max(0, math.min(1, (pos.x - x0) / (x1 - x0)))
        local value = opts.min + (opts.continuous and f * steps or math.floor(f * steps + 0.5))
        opts.on_change(value)
    end
end

function C.toggle(bb, right, cy, on)
    local w, h = D.s(84), D.s(54)
    D.icon(bb, on and "toggle-on" or "toggle-off", right - w, cy - math.floor(h / 2), w, h)
end

function C.radio(bb, x, cy, on)
    local size = D.s(40)
    D.icon(bb, on and "radio-on" or "radio", x, cy - math.floor(size / 2), size, size)
end

return C
