--[[
Drawing primitives for the Kindle look. Every measurement is in pixels of the
Paperwhite 12 in portrait (1272 px wide) and scaled to the actual screen.
]]
local Blitbuffer = require("ffi/blitbuffer")
local Font = require("ui/font")
local RenderImage = require("ui/renderimage")
local RenderText = require("ui/rendertext")
local Screen = require("device").screen
local lfs = require("libs/libkoreader-lfs")

local D = {}

local REFERENCE_WIDTH = 1272

D.BLACK = Blitbuffer.COLOR_BLACK
D.WHITE = Blitbuffer.COLOR_WHITE

function D.gray(value)
    return Blitbuffer.Color8(value)
end

function D.s(n)
    local k = math.min(Screen:getWidth(), Screen:getHeight()) / REFERENCE_WIDTH
    return math.floor(n * k + 0.5)
end

local FACE_FILES = {
    regular = { "Amazon-Ember-Regular.ttf", "NotoSans-Regular.ttf" },
    medium = { "Amazon-Ember-Medium.ttf", "NotoSans-Regular.ttf" },
    bold = { "Amazon-Ember-Bold.ttf", "NotoSans-Bold.ttf" },
    italic = { "Amazon-Ember-RegularItalic.ttf", "NotoSans-Italic.ttf" },
    serif = { "Bookerly-Regular.ttf", "NotoSerif-Regular.ttf" },
    serif_bold = { "Bookerly-Bold.ttf", "NotoSerif-Bold.ttf" },
    -- The Kindle's section headings: Bookerly Display drawn a pixel heavier.
    display = { "BookerlyDisplay-Regular.ttf", "NotoSerif-Regular.ttf", double_strike = true },
}

local SYSTEM_FONT_DIRS = { "/usr/java/lib/fonts", "/mnt/us/fonts" }

-- Font:getFace only takes names relative to KOReader's fonts folder or fonts in
-- its font list, which leaves out some Kindle UI fonts (Ember Medium).
local function fontName(file)
    for _, dir in ipairs(SYSTEM_FONT_DIRS) do
        if lfs.attributes(dir .. "/" .. file, "mode") == "file" then
            local depth = select(2, (lfs.currentdir() .. "/fonts"):gsub("/[^/]+", ""))
            return string.rep("../", depth) .. dir:sub(2) .. "/" .. file
        end
    end
    return file
end

local face_cache = {}

-- `em` is the font size in reference pixels.
function D.face(kind, em)
    local key = kind .. em
    if face_cache[key] then return face_cache[key] end
    local px = D.s(em)
    local size = (px - 0.5) / (Screen:scaleBySize(10000) / 10000)
    local face
    for _, file in ipairs(FACE_FILES[kind]) do
        face = Font:getFace(fontName(file), size)
        if face then break end
    end
    face = face or Font:getFace("cfont", size)
    -- Faces are shared per font file and size; only Lexeme uses these files.
    if FACE_FILES[kind].double_strike then face.lexeme_double = true end
    face_cache[key] = face
    return face
end

function D.width(face, text)
    local width = RenderText:sizeUtf8Text(0, Screen:getWidth() * 8, face, text, true, false).x
    return face.lexeme_double and width + 1 or width
end

-- How far the text's ink reaches above its baseline.
function D.inkTop(face, text)
    return RenderText:sizeUtf8Text(0, Screen:getWidth() * 8, face, text, true, false).y_top
end

function D.fit(face, text, max_w)
    if not max_w or D.width(face, text) <= max_w then return text end
    return RenderText:truncateTextByWidth(text, face, max_w, true, false)
end

function D.text(bb, x, baseline, face, text, color, max_w)
    text = D.fit(face, text, max_w)
    RenderText:renderUtf8Text(bb, x, baseline, face, text, true, false, color or D.BLACK)
    if face.lexeme_double then
        RenderText:renderUtf8Text(bb, x + 1, baseline, face, text, true, false, color or D.BLACK)
    end
    return D.width(face, text)
end

function D.textRight(bb, right, baseline, face, text, color)
    return D.text(bb, right - D.width(face, text), baseline, face, text, color)
end

function D.textCenter(bb, center, baseline, face, text, color, max_w)
    text = D.fit(face, text, max_w)
    return D.text(bb, math.floor(center - D.width(face, text) / 2), baseline, face, text, color)
end

-- Splits text into at most max_lines lines no wider than width; the last one is ellipsized.
function D.wrap(face, text, width, max_lines)
    local lines, line = {}, nil
    for word in text:gmatch("%S+") do
        local candidate = line and (line .. " " .. word) or word
        if not line or D.width(face, candidate) <= width then
            line = candidate
        else
            table.insert(lines, line)
            line = word
        end
    end
    if line then table.insert(lines, line) end
    if #lines > max_lines then
        local last = table.concat(lines, " ", max_lines)
        for i = #lines, max_lines, -1 do lines[i] = nil end
        lines[max_lines] = last
    end
    for i, l in ipairs(lines) do lines[i] = D.fit(face, l, width) end
    return lines
end

function D.rect(bb, x, y, w, h, color)
    bb:paintRect(x, y, w, h, color or D.BLACK)
end

function D.border(bb, x, y, w, h, thickness, color, radius)
    -- Anti-aliasing breaks thin borders with small radii.
    local anti_alias = radius ~= nil and radius > thickness * 6
    bb:paintBorder(x, y, w, h, thickness, color or D.BLACK, radius, anti_alias)
end

function D.roundRect(bb, x, y, w, h, color, radius)
    bb:paintRoundedRect(x, y, w, h, color or D.BLACK, radius)
end

-- A w x h area centred on cx, cy; `extra` fields are kept.
function D.around(cx, cy, w, h, extra)
    local area = extra or {}
    area.x, area.y, area.w, area.h = cx - math.floor(w / 2), cy - math.floor(h / 2), w, h
    return area
end

-- The area inside a border `by` thick; `extra` fields are kept.
function D.inset(x, y, w, h, by, extra)
    local area = extra or {}
    area.x, area.y, area.w, area.h = x + by, y + by, w - 2 * by, h - 2 * by
    return area
end

-- Inverts a rectangle with rounded corners.
function D.invert(bb, x, y, w, h, radius)
    local r = math.min(radius or 0, math.floor(w / 2), math.floor(h / 2))
    for row = 0, r - 1 do
        local dy = r - row - 0.5
        local inset = r - math.floor(math.sqrt(r * r - dy * dy) + 0.5)
        bb:invertRect(x + inset, y + row, w - 2 * inset, 1)
        bb:invertRect(x + inset, y + h - 1 - row, w - 2 * inset, 1)
    end
    bb:invertRect(x, y + r, w, h - 2 * r)
end

local scrim_tile

-- The checkerboard the Kindle lays over whatever is behind a sheet.
function D.scrim(bb, x, y, w, h)
    if not scrim_tile or scrim_tile:getWidth() < w then
        if scrim_tile then scrim_tile:free() end
        scrim_tile = Blitbuffer.new(w, 2, Blitbuffer.TYPE_BB8A)
        for ty = 0, 1 do
            for tx = 0, w - 1 do
                local dot = (tx + ty) % 2 == 0
                scrim_tile:setPixel(tx, ty, Blitbuffer.Color8A(0, dot and 0xFF or 0))
            end
        end
    end
    for row = y, y + h - 1, 2 do
        bb:alphablitFrom(scrim_tile, x, row, 0, 0, w, math.min(2, y + h - row))
    end
end

local icon_dir
local icon_cache = {}

function D.setIconDir(dir)
    icon_dir = dir
end

function D.icon(bb, name, x, y, w, h)
    local key = name .. "|" .. w .. "|" .. h
    local image = icon_cache[key]
    if image == nil then
        image = RenderImage:renderSVGImageFile(icon_dir .. "/" .. name .. ".svg", w, h) or false
        icon_cache[key] = image
    end
    if not image then return end
    bb:alphablitFrom(image, x, y, 0, 0, image:getWidth(), image:getHeight())
end

-- Draws an image scaled to fit w x h, aligned to the bottom centre of that box.
-- Returns the rectangle it covered.
function D.image(bb, image, x, y, w, h)
    local iw, ih = image:getWidth(), image:getHeight()
    local k = math.min(w / iw, h / ih)
    local dw, dh = math.floor(iw * k + 0.5), math.floor(ih * k + 0.5)
    local scaled = RenderImage:scaleBlitBuffer(image, dw, dh, false)
    local dx, dy = x + math.floor((w - dw) / 2), y + h - dh
    bb:blitFrom(scaled, dx, dy, 0, 0, dw, dh)
    scaled:free()
    return dx, dy, dw, dh
end

return D
