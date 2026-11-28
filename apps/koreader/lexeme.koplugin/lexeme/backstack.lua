--[[
"Back to loc 2,147", as the Kindle's reader offers it in the toolbar after a jump: from the table of
contents, the location slider, Go to, a search result or a note. Worked out from Amazon's reader:

- The reading spot is where the book opened. It always has a dot on the slider, and is never put
  on the stack.
- A jump puts the place it left on the stack, unless that place is the reading spot.
- The button goes back to the top of the stack, or to the reading spot once the stack is empty.
- Going back also puts the place left on the stack, but only if the reader had settled there:
  turned a page to it, come back to it, or got to it by a link. A place only jumped to isn't kept.
- Every place on the stack has a dot on the slider.

Places are kept as xpointers, so a font change keeps them.
]]
local Event = require("ui/event")

local Back = {}

-- Per book being read: { home = xp, stack = { xp, ... }, settled = bool, jumping = bool }.
local states = setmetatable({}, { __mode = "k" })

local function state(ui)
    local document = ui and ui.document
    if not (document and ui.rolling) then return nil end
    local s = states[document]
    if not s then
        s = { stack = {}, settled = true }
        states[document] = s
    end
    return s
end

local function here(ui)
    return ui.document:getXPointer()
end

function Back.page(ui, xp)
    return ui.document:getPageFromXPointer(xp)
end

local function samePage(ui, a, b)
    return a and b and Back.page(ui, a) == Back.page(ui, b)
end

-- The book opened here: its reading spot.
function Back.start(ui)
    local s = state(ui)
    if not s then return end
    s.home, s.stack, s.settled = here(ui), {}, true
end

-- A page turned (or anything else that moved the page) that isn't one of our jumps: the reader
-- has settled where it is.
function Back.onPageUpdate(ui)
    local s = state(ui)
    if s and not s.jumping then s.settled = true end
end

local function push(ui, s, xp)
    if samePage(ui, xp, s.home) then return end
    if samePage(ui, xp, s.stack[#s.stack]) then return end
    table.insert(s.stack, xp)
end

-- Moves without the move counting as a page turned.
local function move(ui, s, go)
    s.jumping = true
    local ok, err = pcall(go)
    s.jumping = false
    if not ok then error(err) end
end

-- Runs `go`, a jump away from here (the table of contents, the slider, Go to, a search result).
function Back.jump(ui, go)
    local s = state(ui)
    if not s then return go() end
    if not s.home then s.home = here(ui) end
    push(ui, s, here(ui))
    move(ui, s, go)
    s.settled = false
end

-- Where the button goes: the top of the stack, else the reading spot if the page isn't it.
function Back.target(ui)
    local s = state(ui)
    if not s then return nil end
    local top = s.stack[#s.stack]
    if top then return top, true end
    if s.home and not samePage(ui, s.home, here(ui)) then return s.home, false end
end

function Back.go(ui)
    local s = state(ui)
    local target, from_stack = Back.target(ui)
    if not target then return end
    local left = here(ui)
    if from_stack then table.remove(s.stack) end
    if s.settled and not samePage(ui, left, target) then push(ui, s, left) end
    move(ui, s, function() ui:handleEvent(Event:new("GotoXPointer", target)) end)
    s.settled = true
end

-- The places with a dot on the slider: the stack's and the reading spot.
function Back.marks(ui)
    local s = state(ui)
    if not s then return {} end
    local marks = {}
    if s.home then table.insert(marks, s.home) end
    for _, xp in ipairs(s.stack) do table.insert(marks, xp) end
    return marks
end

-- Settles the reader where a link took them, or where they went back to from one.
function Back.settle(ui)
    local s = state(ui)
    if s then s.settled = true end
end

-- Moves to xp as a link would (or back from one): not a jump, so the stack stays as it is.
function Back.follow(ui, xp)
    local s = state(ui)
    if not s then return ui:handleEvent(Event:new("GotoXPointer", xp)) end
    move(ui, s, function() ui:handleEvent(Event:new("GotoXPointer", xp)) end)
    s.settled = true
end

-- "loc 2,147" (the toolbar's button) or "loc 2147" (the bar after a link), or "page 12" in a book
-- without locations.
function Back.label(ui, xp, grouped)
    local Locations = require("lexeme/locations")
    local location = Locations.at(ui, xp)
    if location then
        return "loc " .. (grouped and Back.group(location) or tostring(location))
    end
    local page = Back.page(ui, xp)
    local pagemap = ui.pagemap
    if pagemap and pagemap.has_pagemap and pagemap.getXPointerPageLabel then
        local label = pagemap:getXPointerPageLabel(xp, true)
        if label and label ~= "" then return "page " .. label end
    end
    return "page " .. (grouped and Back.group(page) or tostring(page))
end

-- 2475 -> "2,475"
function Back.group(n)
    local s = tostring(math.floor(n))
    local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
    return (out:gsub("^,", ""))
end

return Back
