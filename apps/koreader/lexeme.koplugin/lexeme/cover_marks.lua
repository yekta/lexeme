--[[
What the Kindle's library draws on a cover, measured on a Paperwhite 5 (see the Library grid notes in
amazon-reference): how far into the book, on a ribbon at the cover's top right; "New" or "Read" on a
band across that corner; a ✓ at its bottom left for a book on the device. Each has a thin gray
outline, which shows on a dark cover. Sizes are the Kindle's own pixels (D.px), and the shapes are
icons drawn once at their size.
]]
local Blitbuffer = require("ffi/blitbuffer")

local D = require("lexeme/draw")

local CoverMarks = {}

-- The face of a ribbon's percent (15 px digits), and of a band's word (capitals 15.6 px across the band).
local function face() return D.nface("bold", 21) end
local function bandFace() return D.nface("bold", 23) end

local labels = {}

-- `text` in white, turned 45° clockwise to run down a band, in a square centred on its ink. Made once.
local function turnedLabel(text)
    local f = bandFace()
    local key = text .. "|" .. tostring(f.size)
    if labels[key] then return labels[key] end
    local w, h = D.width(f, text) + 4, math.ceil(f.size * 1.8)
    local flat = Blitbuffer.new(w, h, Blitbuffer.TYPE_BB8)
    flat:fill(Blitbuffer.COLOR_BLACK)
    D.text(flat, 2, math.ceil(f.size * 1.2), f, text, D.WHITE)
    local function at(x, y)
        if x < 0 or y < 0 or x >= w or y >= h then return 0 end
        return flat:getPixel(x, y):getColor8().a
    end
    local x0, y0, x1, y1 = w, h, -1, -1
    for y = 0, h - 1 do
        for x = 0, w - 1 do
            if at(x, y) > 0 then
                x0, y0, x1, y1 = math.min(x0, x), math.min(y0, y), math.max(x1, x), math.max(y1, y)
            end
        end
    end
    local cx, cy = (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2
    local size = math.ceil((x1 - x0 + y1 - y0 + 2) * math.sqrt(0.5)) + 3
    local turned = Blitbuffer.new(size, size, Blitbuffer.TYPE_BB8A)
    local c = math.sqrt(0.5)
    for ty = 0, size - 1 do
        for tx = 0, size - 1 do
            -- The flat label's point under this one, read between its four nearest pixels.
            local dx, dy = tx + 0.5 - size / 2, ty + 0.5 - size / 2
            local sx, sy = cx + c * (dx + dy) - 0.5, cy + c * (dy - dx) - 0.5
            local ix, iy = math.floor(sx), math.floor(sy)
            local fx, fy = sx - ix, sy - iy
            local v = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy)
                + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
            turned:setPixel(tx, ty, Blitbuffer.Color8A(255, math.floor(v + 0.5)))
        end
    end
    flat:free()
    labels[key] = turned
    return turned
end

-- The ribbon at the top right of the cover at x, y (w x h, inside its 2 px border), with `text`.
function CoverMarks.ribbon(bb, x, y, w, text)
    D.icon(bb, "cover-ribbon", x + w - D.px(80), y - D.px(2), D.px(68), D.px(67))
    D.textCenter(bb, x + w - D.px(47), y + D.px(31), face(), text, D.WHITE)
end

-- The band across the cover's top right corner, saying `text`.
function CoverMarks.band(bb, x, y, w, h, text)
    local size = math.min(D.px(146), h + D.px(2))
    local band_x = x + w - D.px(144)
    if band_x < x - D.px(2) then return end
    local image = D.iconImage("cover-band", D.px(146), D.px(146))
    if image then bb:alphablitFrom(image, band_x, y - D.px(2), 0, 0, D.px(146), size) end
    local label = turnedLabel(text)
    local n = label:getWidth()
    bb:alphablitFrom(label, x + w - D.px(55) - math.floor(n / 2), y + D.px(56) - math.floor(n / 2), 0, 0, n, n)
end

-- The ✓ at the cover's bottom left: the book is on the device.
function CoverMarks.check(bb, x, y, h)
    D.icon(bb, "cover-check", x + D.px(10), y + h - D.px(63), D.px(52), D.px(52))
end

-- Where the cover's ⋮ goes: three dots up the bottom right corner.
function CoverMarks.menuBox(x, y, w, h)
    return x + w - D.px(28), y + h - D.px(61), D.px(14), D.px(50)
end

return CoverMarks
