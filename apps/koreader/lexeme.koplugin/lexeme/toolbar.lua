-- What tapping the top of a page shows: the reading toolbar and the progress panel.
--
-- Drawn as the Kindle's reader draws it, at its own sizes (D.px) and with its own icons; positions
-- are a Paperwhite 5's, pinned to the screen's edges (D.right, D.bottom).
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")

local Back = require("lexeme/backstack")
local D = require("lexeme/draw")
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
    self:paintTimer(bb, x, y)
    D.rect(bb, x, y + D.px(212), w, D.px(4), D.gray(170))

    local title = self.ui.doc_props and self.ui.doc_props.display_title or ""
    D.text(bb, x + D.px(36), y + D.px(288), D.nface("bold", 32), title, D.BLACK, w - D.px(72))
    D.rect(bb, x, y + D.px(334), w, D.px(4))
end

-- A set reading timer shows in the gap between Home and the buttons: the time left (or that
-- it's paused), and a line under it that fills as the time passes. Tapping it opens Pause or
-- Resume, and Stop.
function Toolbar:paintTimer(bb, x, y)
    if not Timer.isRunning() then return end
    local face = D.nface("regular", 32)
    local label = Timer.statusLabel()
    local icon_w, gap = D.px(40), D.px(12)
    local group_w = icon_w + gap + D.width(face, label)
    local left = x + D.px(497) - math.floor(group_w / 2)
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

local function group(label)
    if tonumber(label) then return Back.group(tonumber(label)) end
    return label
end

-- The line under the chapter title follows the reading progress chosen under the page (a tap on
-- it there cycles it): "Loc 2,147 of 2,475 | Time left in chapter: 1 min | 87%".
local function progressLine(ui)
    local mode = require("lexeme/footer").mode()
    local percent = Progress.percent(ui) .. "%"
    local chapter = "Time left in chapter: " .. Progress.chapterTimeLeft(ui)
    if mode == "chapter_time" then return chapter .. " | " .. percent end
    if mode == "book_time" then return "Time left in book: " .. Progress.bookTimeLeft(ui) .. " | " .. percent end
    local location, locations = require("lexeme/locations").current(ui)
    local where
    if mode == "page" or not location then
        where = string.format("Page %s of %s", group(Progress.pageLabel(ui)), group(Progress.pageCountLabel(ui)))
    else
        where = string.format("Loc %s of %s", Back.group(location), Back.group(locations or location))
    end
    return where .. " | " .. chapter .. " | " .. percent
end

-- The slider's dots: the places "Back to" can go (lexeme/backstack.lua).
local function paintMarks(bb, ui, x0, x1, cy, count)
    local size = D.px(48)
    for _, xp in ipairs(Back.marks(ui)) do
        local page = Back.page(ui, xp)
        local f = count > 1 and (page - 1) / (count - 1) or 0
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
    D.textCenter(bb, x + w / 2, at(1526), D.nface("regular", 32), progressLine(ui), D.BLACK, w - D.px(260))

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
    local fraction = count > 1 and (page - 1) / (count - 1) or 0
    local kx = math.floor(x0 + (x1 - x0) * fraction + 0.5)
    D.rect(bb, x0, at(1589), kx - x0, D.px(14))
    D.rect(bb, kx, at(1594), x1 - kx + 1, D.px(4))
    paintMarks(bb, ui, x0, x1, cy, count)
    local knob = D.px(61)
    D.icon(bb, "knob", kx - math.floor(knob / 2), cy - math.floor(knob / 2), knob, knob)
    self:hit(x0 - D.px(10), cy - D.px(45), x1 - x0 + D.px(20), D.px(90), function()
        local pos = self.last_tap
        if not pos then return end
        local f = math.max(0, math.min(1, (pos.x - x0) / (x1 - x0)))
        self:jump(math.floor(1 + f * (count - 1) + 0.5))
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
