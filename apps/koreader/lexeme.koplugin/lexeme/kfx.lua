--[[
Amazon's KFX books, read only as far as where the Kindle puts each location.
A KFX file is a container of Amazon Ion entities: the text ($145), the storylines
that place it ($259), the sections that show the storylines ($260) in the book's
reading order ($169, in $538 or $258), and the location map ($550), whose entries
point at a paragraph and a character offset into it.
]]
local Kfx = {}

local TEXT, STORYLINE, SECTION, LOCATION_MAP, METADATA, DOCUMENT_DATA = 145, 259, 260, 550, 258, 538
local NAME, ITEMS, CONTENT, INDEX, ID, OFFSET, STORY_NAME, ENTRIES = 4, 146, 145, 403, 155, 143, 176, 182
local SECTION_NAME, TEMPLATES, READING_ORDERS, SECTIONS = 174, 141, 169, 170

local function u32(s, i)
    local a, b, c, d = s:byte(i, i + 3)
    return a + b * 0x100 + c * 0x10000 + d * 0x1000000
end

local function varuint(s, i)
    local v = 0
    while true do
        local c = s:byte(i)
        i = i + 1
        v = v * 128 + c % 128
        if c >= 128 then return v, i end
    end
end

local function uint(s, i, stop)
    local v = 0
    for k = i, stop - 1 do v = v * 256 + s:byte(k) end
    return v
end

-- One Ion binary value at i: its Lua form (symbols as their ids) and where the next one starts.
local function value(s, i)
    local td = s:byte(i)
    i = i + 1
    local t, l = math.floor(td / 16), td % 16
    if t == 1 then return l == 1, i end
    if l == 15 then return nil, i end
    if l == 14 or (t == 13 and l == 1) then l, i = varuint(s, i) end
    local stop = i + l
    if t == 2 or t == 7 then return uint(s, i, stop), stop end
    if t == 3 then return -uint(s, i, stop), stop end
    if t == 8 then return s:sub(i, stop - 1), stop end
    if t == 11 or t == 12 then
        local list = {}
        while i < stop do
            local v
            v, i = value(s, i)
            if v ~= nil then list[#list + 1] = v end
        end
        return list, stop
    end
    if t == 13 then
        local struct = {}
        while i < stop do
            local field
            field, i = varuint(s, i)
            struct[field], i = value(s, i)
        end
        return struct, stop
    end
    if t == 14 then
        local annotations, j = varuint(s, i)
        return (value(s, j + annotations)), stop
    end
    return nil, stop
end

local function ion(s, i)
    if s:sub(i, i + 3) == "\224\1\0\234" then i = i + 4 end
    return (value(s, i))
end

local function entities(s)
    if s:sub(1, 4) ~= "CONT" then return end
    local header = u32(s, 7)
    local info = ion(s, u32(s, 11) + 1)
    local index, size = info[413], info[414]
    if not index or not size then return end
    local found = {
        [TEXT] = {}, [STORYLINE] = {}, [SECTION] = {}, [LOCATION_MAP] = {}, [METADATA] = {}, [DOCUMENT_DATA] = {},
    }
    for k = 0, size / 24 - 1 do
        local entry = index + 1 + k * 24
        local kind = u32(s, entry + 4)
        if found[kind] then
            local at = header + u32(s, entry + 8) + u32(s, entry + 12) * 2 ^ 32 + 1
            if s:sub(at, at + 3) ~= "ENTY" then return end
            table.insert(found[kind], ion(s, at + u32(s, at + 6)))
        end
    end
    return found
end

local function codepoints(text)
    local _, continuation = text:gsub("[\128-\191]", "")
    return #text - continuation
end

-- Spaces of every kind, soft hyphens and byte-order marks: never counted, as the two copies differ in them.
local INVISIBLE = {
    "%s", "\194\160", "\194\173", "\226\128[\128-\139\175]", "\226\129\159", "\227\128\128", "\239\187\191",
}

-- Characters as locations are matched by: the visible ones.
function Kfx.length(text)
    local count = codepoints(text)
    for _, pattern in ipairs(INVISIBLE) do
        if text:find(pattern) then
            local _, found = text:gsub(pattern, "")
            count = count - found
        end
    end
    return count
end

-- Whether the code point at byte i is one Kfx.length counts.
local function visible(text, i)
    local c = text:byte(i)
    if c == 32 or (c >= 9 and c <= 13) then return false end
    if c < 0xC2 then return true end
    local b2, b3 = text:byte(i + 1, i + 2)
    if c == 0xC2 then return b2 ~= 0xA0 and b2 ~= 0xAD end
    if c == 0xE2 then
        return not ((b2 == 0x80 and (b3 <= 0x8B or b3 == 0xAF)) or (b2 == 0x81 and b3 == 0x9F))
    end
    if c == 0xE3 then return not (b2 == 0x80 and b3 == 0x80) end
    if c == 0xEF then return not (b2 == 0xBB and b3 == 0xBF) end
    return true
end

--[[
Walks a paragraph's segments (text, or false for a picture, which takes one
position) and counts the visible characters before a position. Locations come
in order, so it carries on from where it last stopped in the same paragraph.
]]
local Cursor = {}
Cursor.__index = Cursor

function Cursor.new(segments)
    return setmetatable({ segments = segments, segment = 1, byte = 1, position = 0, chars = 0 }, Cursor)
end

function Cursor:charsBefore(position)
    while self.position < position do
        local segment = self.segments[self.segment]
        if segment == nil then break end
        if segment == false or self.byte > #segment then
            if segment == false then self.position = self.position + 1 end
            self.segment, self.byte = self.segment + 1, 1
        else
            local c = segment:byte(self.byte)
            if visible(segment, self.byte) then self.chars = self.chars + 1 end
            self.byte = self.byte + (c >= 240 and 4 or c >= 224 and 3 or c >= 192 and 2 or 1)
            self.position = self.position + 1
        end
    end
    return self.chars
end

-- Whether an item's content mixes text in with pictures, as a picture with its caption does.
local function mixed(items)
    for _, item in ipairs(items or {}) do
        if type(item) == "string" then return true end
    end
    return false
end

--[[
Where each of the book's locations starts, as a count of the characters before it
in reading order: an ascending list with one entry per location. Nil for a file
that isn't a readable KFX (an encrypted one from the Kindle Store, say).
]]
function Kfx.locationStarts(path)
    local file = io.open(path, "rb")
    if not file then return end
    local s = file:read("*a")
    file:close()
    local ok, found = pcall(entities, s)
    if not ok or not found or #found[LOCATION_MAP] == 0 then return end
    local map = found[LOCATION_MAP][1]
    local locations = map[1] and map[1][ENTRIES]
    if not locations then return end

    local texts, stories, sections = {}, {}, {}
    for _, content in ipairs(found[TEXT]) do texts[content[NAME]] = content[ITEMS] end
    for _, story in ipairs(found[STORYLINE]) do stories[story[STORY_NAME]] = story end
    for _, section in ipairs(found[SECTION]) do sections[section[SECTION_NAME]] = section end
    local reading_order
    for _, data in ipairs(found[DOCUMENT_DATA]) do reading_order = reading_order or data[READING_ORDERS] end
    for _, data in ipairs(found[METADATA]) do reading_order = reading_order or data[READING_ORDERS] end
    if not (reading_order and reading_order[1] and reading_order[1][SECTIONS]) then return end

    local function textOf(item)
        local ref = type(item) == "table" and item[CONTENT]
        local text = type(ref) == "table" and texts[ref[NAME]] and texts[ref[NAME]][ref[INDEX] + 1]
        return type(text) == "string" and text or nil
    end

    -- Every paragraph in reading order: section by section, through the storylines they show.
    local start, segments_of, total, shown = {}, {}, 0, {}
    local function walk(items)
        for _, item in ipairs(items or {}) do
            if type(item) == "table" then
                local id = item[ID]
                local inline = mixed(item[ITEMS])
                if id and not start[id] then
                    start[id] = total
                    local text = textOf(item)
                    local segments = text and { text } or inline and {} or nil
                    if inline and not text then
                        for _, part in ipairs(item[ITEMS]) do
                            local part_text = type(part) == "string" and part or textOf(part)
                            if type(part) == "table" and part[ID] and not start[part[ID]] then
                                start[part[ID]] = total
                            end
                            table.insert(segments, part_text or false)
                            if part_text then total = total + Kfx.length(part_text) end
                        end
                    elseif text then
                        total = total + Kfx.length(text)
                    end
                    segments_of[id] = segments
                end
                if not inline then walk(item[ITEMS]) end
                local story = stories[item[STORY_NAME]]
                if story and not shown[story] then
                    shown[story] = true
                    walk(story[ITEMS])
                end
            end
        end
    end
    for _, name in ipairs(reading_order[1][SECTIONS]) do
        if sections[name] then walk(sections[name][TEMPLATES]) end
    end

    local starts, cursor, cursor_id = {}, nil, nil
    for i, location in ipairs(locations) do
        local id, offset = location[ID], location[OFFSET] or 0
        if start[id] then
            local segments = segments_of[id]
            if segments and offset > 0 then
                if cursor_id ~= id or cursor.position > offset then cursor, cursor_id = Cursor.new(segments), id end
                starts[i] = start[id] + cursor:charsBefore(offset)
            else
                starts[i] = start[id]
            end
        end
    end
    -- Locations on a section rather than a paragraph start where the next one does.
    local next_start = total
    for i = #locations, 1, -1 do
        starts[i] = math.min(starts[i] or next_start, next_start)
        next_start = starts[i]
    end
    return starts
end

return Kfx
