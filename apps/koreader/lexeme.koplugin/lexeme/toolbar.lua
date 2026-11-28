-- What tapping the top of a page shows: the reading toolbar and the progress panel.
--
-- Drawn as the Kindle's reader draws it, at its own sizes (D.px) and with its own icons; positions
-- are a Paperwhite 5's, pinned to the screen's edges (D.right, D.bottom).
local Blitbuffer = require("ffi/blitbuffer")
local Geom = require("ui/geometry")
local RenderImage = require("ui/renderimage")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local Back = require("lexeme/backstack")
local D = require("lexeme/draw")
local Footer = require("lexeme/footer")
local Locations = require("lexeme/locations")
local Menu = require("lexeme/menu")
local Progress = require("lexeme/progress")
local Status = require("lexeme/status")
local Timer = require("lexeme/timer")
local View = require("lexeme/view")

local Toolbar = View:extend{
    ui = nil,
    -- Callbacks for the toolbar buttons, provided by reader.lua.
    actions = nil,
    background = false,
}

local TOP_HEIGHT = 338
local BOTTOM_TOP = 1425 -- the progress panel's top border, on a Paperwhite 5
local ICON = 40
local TIMER_FROM_RIGHT = 540 -- the Aa icon's left edge (480) and a gap as wide as the buttons'

-- Amazon's icons, from its reader; Lexeme's look-alikes off a Kindle.
local KINDLE_ICONS = "/app/KPPMainApp/res/KPPUIComponents/internal/icons/"
local FALLBACK = {
    ["arrow-left"] = "arrow-left", aa = nil, ["table-of-contents"] = "list-toc", ["notebook-normal"] = "notebook",
    search = "search", ["more-filled"] = "ellipsis-vertical", ["chapter-back"] = "skip-back",
    ["chapter-forward"] = "skip-forward", ["birds-eye-view"] = "layout-grid",
}
local found = {}
local function icon(name)
    if found[name] == nil then
        local path = KINDLE_ICONS .. name .. ".svg"
        found[name] = lfs.attributes(path, "mode") == "file" and path or (FALLBACK[name] or false)
    end
    return found[name] or nil
end

local function paintIcon(bb, name, cx, cy, size, gray)
    local file = icon(name)
    local x, y = math.floor(cx - size / 2 + 0.5), math.floor(cy - size / 2 + 0.5)
    if file then
        D.icon(bb, file, x, y, size, size)
    elseif name == "aa" then
        D.textCenter(bb, cx, cy + D.px(12), D.nface("regular", 36), "Aa")
    end
    -- A button with nothing to do is drawn gray, as the Kindle's are.
    if gray then bb:lightenRect(x, y, size, size, 0.55) end
end

function Toolbar:init()
    View.init(self)
    self.covers_fullscreen = false
end

function Toolbar:run(action)
    self:close()
    UIManager:nextTick(function() self.actions[action]() end)
end

function Toolbar:render(bb, x, y, w, h)
    self:paintTop(bb, x, y, w)
    local bottom = y + D.bottom(h, BOTTOM_TOP)
    -- Tapping the page between the two bars closes them.
    self:hit(x, y + D.px(TOP_HEIGHT), w, bottom - y - D.px(TOP_HEIGHT), function() self:close() end)
    self:paintStrip(bb, x, y + D.px(TOP_HEIGHT), w, bottom - y - D.px(TOP_HEIGHT))
    self:paintBack(bb, x, y, w, h)
    self:paintBottom(bb, x, bottom, w, h)
end

function Toolbar:paintTop(bb, x, y, w)
    D.rect(bb, x, y, w, D.px(TOP_HEIGHT), D.WHITE)
    Status.paint(self, bb, x, y, w, function() self:run("quick") end)

    paintIcon(bb, "arrow-left", x + D.px(57), y + D.px(158), D.px(ICON))
    -- Back to the tab the book was opened from, named like on the Kindle.
    local label = G_reader_settings:readSetting("lexeme_tab") == "library" and "Library" or "Home"
    local label_w = D.text(bb, x + D.px(108), y + D.px(170), D.nface("regular", 36), label)
    self:pressable(x, y + D.px(100), D.px(260), D.px(112), function() self:run("back") end,
        { x = x + D.px(7), y = y + D.px(108), w = label_w + D.px(137), h = D.px(101) })

    -- Each button's icon centre, measured from the right edge (the Kindle's ⋮ is 58 px in).
    local buttons = {
        { action = "aa", icon = "aa", from_right = 460 },
        { action = "goto", icon = "table-of-contents", from_right = 359 },
        { action = "notebook", icon = "notebook-normal", from_right = 260 },
        { action = "search", icon = "search", from_right = 158 },
        { action = "more", icon = "more-filled", from_right = 58 },
    }
    for _, b in ipairs(buttons) do
        local cx = x + w - D.px(b.from_right)
        paintIcon(bb, b.icon, cx, y + D.px(158), D.px(ICON))
        local box = { x = cx - D.px(50), y = y + D.px(108), w = D.px(101), h = D.px(101) }
        self:pressable(cx - D.px(50), y + D.px(100), D.px(100), D.px(112), function()
            if b.action == "more" then
                self:openMore(x + w)
            else
                self:run(b.action)
            end
        end, box)
    end
    self:paintTimer(bb, x, y, w)
    D.rect(bb, x, y + D.px(212), w, D.px(4), D.gray(170))

    local title = self.ui.doc_props and self.ui.doc_props.display_title or ""
    D.text(bb, x + D.px(36), y + D.px(288), D.nface("bold", 32), title, D.BLACK, w - D.px(72))
    D.rect(bb, x, y + D.px(334), w, D.px(4))
end

-- A set reading timer shows left of the buttons: the time left (or that it's paused), and a
-- line under it that fills as the time passes. Tapping it opens Pause or Resume, and Stop.
function Toolbar:paintTimer(bb, x, y, w)
    if not Timer.isRunning() then return end
    local face = D.nface("regular", 32)
    local label = Timer.statusLabel()
    local icon_w, gap = D.px(40), D.px(12)
    local group_w = icon_w + gap + D.width(face, label)
    local left = x + w - D.px(TIMER_FROM_RIGHT) - group_w
    D.icon(bb, "timer", left, y + D.px(132), icon_w, icon_w)
    D.text(bb, left + icon_w + gap, y + D.px(164), face, label)
    local line_y = y + D.px(186)
    D.rect(bb, left, line_y, group_w, D.px(2), D.gray(170))
    local passed = math.floor(group_w * Timer.progress() + 0.5)
    if passed > 0 then D.rect(bb, left, line_y - D.px(1), passed, D.px(4)) end

    local box = { x = left - D.px(20), y = y + D.px(108), w = group_w + D.px(40), h = D.px(101) }
    self:pressable(box.x, box.y, box.w, box.h, function()
        Menu:new{
            items = Timer.controlItems(function() self:refresh() end),
            left = box.x, top = y + D.px(223),
        }:show()
    end, box)
end

function Toolbar:openMore(right)
    local items = {}
    for _, item in ipairs(self.actions.more_items()) do
        if item == "-" then
            table.insert(items, item)
        else
            table.insert(items, { text = item.text, enabled = item.enabled, callback = function()
                self:close()
                item.callback()
            end })
        end
    end
    Menu:new{ items = items, right = right - D.px(37), top = D.px(223) }:show()
end

-- A page label as the Kindle writes it: "1,514" when it's a number.
function Toolbar.number(label)
    local n = tonumber(label)
    return n and Locations.format(n) or label
end

-- The pages either side of the one being read, small, between the two bars: the page itself in the
-- middle, the end of the one before at the left edge, the start of the next at the right, as the
-- Kindle's reader shows them. They're drawn as crengine draws the book, with its highlights, and
-- scaled down; a tap on the page before or after turns to it, one on the page itself closes the bars.
local thumbs = setmetatable({}, { __mode = "k" })

local function thumbnail(ui, page, tw, th)
    local doc = ui.document
    local layout = doc:getPageCount()
    local cache = thumbs[doc]
    if not cache or cache.layout ~= layout or cache.w ~= tw then
        if cache then for _, t in pairs(cache.pages) do t:free() end end
        cache = { layout = layout, w = tw, pages = {} }
        thumbs[doc] = cache
    end
    if cache.pages[page] then return cache.pages[page] end
    local w, h = Screen:getWidth(), Screen:getHeight()
    local full = Blitbuffer.new(w, h, Screen.bb:getType())
    full:fill(Blitbuffer.COLOR_WHITE)
    local shown = doc:getCurrentPage()
    local ok, err = pcall(function()
        doc:drawCurrentViewByPage(full, 0, 0, Geom:new{ x = 0, y = 0, w = w, h = h }, page)
        for _, item in ipairs(ui.annotation and ui.annotation.annotations or {}) do
            if item.drawer and type(item.pos0) == "string" and type(item.pos1) == "string"
                    and doc:getPageFromXPointer(item.pos0) <= page and doc:getPageFromXPointer(item.pos1) >= page then
                for _, box in ipairs(doc:getScreenBoxesFromPositions(item.pos0, item.pos1, true)) do
                    if box.y >= 0 and box.y < h then
                        full:darkenRect(box.x + 1, box.y, math.max(1, box.w - 2), box.h, 71 / 255)
                    end
                end
            end
        end
    end)
    doc:gotoPage(shown)
    if not ok then
        logger.warn("Lexeme: page thumbnail", err)
        full:free()
        return nil
    end
    local thumb = RenderImage:scaleBlitBuffer(full, tw, th, true)
    -- Only the pages around the one being read are kept.
    for p, t in pairs(cache.pages) do
        if math.abs(p - page) > 3 then t:free(); cache.pages[p] = nil end
    end
    cache.pages[page] = thumb
    return thumb
end

function Toolbar:paintStrip(bb, x, y, w, h)
    local ui = self.ui
    if not ui.rolling then return end
    D.rect(bb, x, y, w, h, D.WHITE)
    -- 34 px under the top bar and over the progress panel, a 2 px border, 43 px apart.
    local border, gap = D.px(2), D.px(43)
    local box_y = y + D.px(34)
    local box_h = h - D.px(34) - D.px(34)
    local th = box_h - 2 * border
    local tw = math.floor(th * Screen:getWidth() / Screen:getHeight() + 0.5)
    local box_w = tw + 2 * border
    local cx = x + math.floor((w - box_w) / 2 + 0.5)
    local page, count = Progress.page(ui), Progress.pageCount(ui)
    self.strip = { x = x, y = y, w = w, h = h }
    local slots = {
        { page = page, left = cx },
        { page = page - 1, left = cx - gap - box_w, tap = function() self:turn(-1) end },
        { page = page + 1, left = cx + box_w + gap, tap = function() self:turn(1) end },
    }
    for _, slot in ipairs(slots) do
        if slot.page >= 1 and slot.page <= count then
            local thumb = thumbnail(ui, slot.page, tw, th)
            D.border(bb, slot.left, box_y, box_w, box_h, border)
            if thumb then
                local sx, dx = 0, slot.left + border
                if dx < x then sx, dx = x - dx, x end
                local vw = math.min(tw - sx, x + w - dx)
                if vw > 0 then bb:blitFrom(thumb, dx, box_y + border, sx, 0, vw, th) end
            end
            if slot.tap then
                local hx = math.max(x, slot.left)
                local hw = math.min(x + w, slot.left + box_w) - hx
                if hw > 0 then self:hit(hx, box_y, hw, box_h, slot.tap) end
            end
        end
    end
end

-- A page turned from the strip: not a jump, so nothing to go back to.
function Toolbar:turn(by)
    local Event = require("ui/event")
    self.ui:handleEvent(Event:new("GotoViewRel", by))
    self:refresh()
end

-- Swiping across the strip turns the page, as on the Kindle: left to the next, right to the one before.
function Toolbar:onSwipe(direction, ges)
    local strip = self.strip
    if not (strip and self.ui.rolling) then return end
    local pos = ges.pos
    if pos.x < strip.x or pos.x >= strip.x + strip.w or pos.y < strip.y or pos.y >= strip.y + strip.h then return end
    local by = direction == "west" and 1 or direction == "east" and -1 or nil
    if not by then return end
    local page = Progress.page(self.ui) + by
    if page >= 1 and page <= Progress.pageCount(self.ui) then self:turn(by) end
    return true
end

-- "Back to loc 2,147", just above the progress panel: on the left when that place is behind the
-- page, on the right when it's ahead.
function Toolbar:paintBack(bb, x, y, w, h)
    local ui = self.ui
    local target = Back.target(ui)
    if not target then return end
    local face = D.nface("regular", 32)
    local text = "Back to " .. Back.label(ui, target, true)
    local text_w = D.width(face, text)
    local box_w, box_h = text_w + D.px(71), D.px(88)
    local behind = Back.page(ui, target) < Progress.page(ui)
    local left = behind and x + D.px(40) or x + w - D.px(40) - box_w
    local top = y + D.bottom(h, 1299)
    local halo = D.px(4)
    D.rect(bb, left - halo, top - halo, box_w + 2 * halo, box_h + 2 * halo, D.gray(221))
    -- A 2 px border, 1 px along the bottom.
    D.rect(bb, left, top, box_w, box_h, D.BLACK)
    D.rect(bb, left + D.px(2), top + D.px(2), box_w - D.px(4), box_h - D.px(3), D.WHITE)
    D.text(bb, left + D.px(38), top + D.px(55), face, text)
    self:pressable(left - halo, top - halo, box_w + 2 * halo, box_h + 2 * halo, function()
        Back.go(ui)
        self:refresh()
    end, { x = left, y = top, w = box_w, h = box_h })
end

-- The slider's dots: the places "Back to" can go (lexeme/backstack.lua).
-- With "Progress by location", the slider runs over the book's locations, as the percent does, rather
-- than its pages: their count then, nil otherwise.
local function sliderLocations(ui)
    if not (ui.rolling and G_reader_settings:isTrue("lexeme_progress_by_location")) then return nil end
    local _, total = Locations.current(ui)
    return total and total > 0 and total or nil
end

local function paintMarks(bb, ui, x0, x1, cy, count, total)
    local size = D.px(48)
    for _, xp in ipairs(Back.marks(ui)) do
        local f
        if total then
            f = math.min(1, (Locations.at(ui, xp) or 1) / total)
        else
            local page = Back.page(ui, xp)
            f = count > 1 and (page - 1) / (count - 1) or 0
        end
        local mx = math.floor(x0 + (x1 - x0) * f + 0.5)
        D.icon(bb, "slider-mark", mx - math.floor(size / 2), cy - math.floor(size / 2), size, size)
    end
end

function Toolbar:paintBottom(bb, x, y, w, h)
    local ui = self.ui
    D.rect(bb, x, y, w, h - y, D.WHITE)
    D.rect(bb, x, y, w, D.px(4))

    local function at(v) return D.bottom(h, v) end
    D.textCenter(bb, x + w / 2, at(1479), D.nface("regular", 36), Progress.chapter(ui), D.BLACK, w - D.px(260))
    local page, count = Progress.page(ui), Progress.pageCount(ui)
    local position = string.format("Page %s of %s", Toolbar.number(Progress.pageLabel(ui)),
        Toolbar.number(Progress.pageCountLabel(ui)))
    if Footer.mode() == "location" then
        local location, total = Locations.current(ui)
        if location then
            position = string.format("Loc %s of %s", Locations.format(location), Locations.format(total))
        end
    end
    local info = string.format("%s | Time left in chapter: %s | %d%%", position, Progress.chapterTimeLeft(ui),
        Progress.percent(ui))
    D.textCenter(bb, x + w / 2, at(1526), D.nface("regular", 32), info, D.BLACK, w - D.px(260))

    local prev_chapter = ui.toc:getPreviousChapter(page)
    local next_chapter = ui.toc:getNextChapter(page)
    local skip_y = at(1490)
    paintIcon(bb, "chapter-back", x + D.px(64), skip_y, D.px(ICON), not prev_chapter)
    paintIcon(bb, "chapter-forward", x + w - D.px(65), skip_y, D.px(ICON), not next_chapter)
    if prev_chapter then
        self:pressable(x, y + D.px(20), D.px(130), D.px(100), function() self:jump(prev_chapter) end,
            D.around(x + D.px(64), skip_y, D.px(101), D.px(101)))
    end
    if next_chapter then
        self:pressable(x + w - D.px(130), y + D.px(20), D.px(130), D.px(100), function() self:jump(next_chapter) end,
            D.around(x + w - D.px(65), skip_y, D.px(101), D.px(101)))
    end

    paintIcon(bb, "birds-eye-view", x + D.px(65), at(1595), D.px(44))
    self:pressable(x, at(1545), D.px(140), D.px(103), function() self:run("pages") end,
        D.around(x + D.px(65), at(1595), D.px(101), D.px(101)))

    -- The slider: a thick line up to the page, a thin one after, the places to go back to, the knob.
    local x0, x1, cy = x + D.px(186), x + w - D.px(188), at(1596)
    local total = sliderLocations(ui)
    local fraction = total and Progress.fraction(ui) or count > 1 and (page - 1) / (count - 1) or 0
    local kx = math.floor(x0 + (x1 - x0) * fraction + 0.5)
    D.rect(bb, x0, at(1589), kx - x0, D.px(14))
    D.rect(bb, kx, at(1594), x1 - kx + 1, D.px(4))
    paintMarks(bb, ui, x0, x1, cy, count, total)
    local knob = D.px(61)
    D.icon(bb, "knob", kx - math.floor(knob / 2), cy - math.floor(knob / 2), knob, knob)
    self:hit(x0 - D.px(10), cy - D.px(45), x1 - x0 + D.px(20), D.px(90), function()
        local pos = self.last_tap
        if not pos then return end
        local f = math.max(0, math.min(1, (pos.x - x0) / (x1 - x0)))
        if total then
            local location = math.max(1, math.floor(f * total + 0.5))
            Back.jump(ui, function() Locations.goTo(ui, location) end)
            self:refresh()
        else
            self:jump(math.floor(1 + f * (count - 1) + 0.5))
        end
    end)
end

-- A jump from the toolbar (a chapter, the slider): the page left can be gone back to.
function Toolbar:jump(page)
    Back.jump(self.ui, function() Progress.goToPage(self.ui, page) end)
    self:refresh()
end

function Toolbar.show(ui, actions)
    Toolbar.actions_for = Toolbar.actions_for or setmetatable({}, { __mode = "k" })
    actions = actions or Toolbar.actions_for[ui]
    Toolbar.actions_for[ui] = actions
    local toolbar = Toolbar:new{ ui = ui, actions = actions, region = nil }
    UIManager:show(toolbar, "ui")
    return toolbar
end

return Toolbar
