-- What tapping the top of a page shows: the reading toolbar and the progress panel.
local UIManager = require("ui/uimanager")

local C = require("lexeme/controls")
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
local BOTTOM_HEIGHT = 1696 - 1473

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
    self:paintBottom(bb, x, y + h - D.s(BOTTOM_HEIGHT), w)
    -- Tapping the page between the two bars closes them.
    self:hit(x, y + D.s(TOP_HEIGHT), w, h - D.s(TOP_HEIGHT + BOTTOM_HEIGHT), function() self:close() end)
end

function Toolbar:paintTop(bb, x, y, w)
    D.rect(bb, x, y, w, D.s(TOP_HEIGHT), D.WHITE)
    Status.paint(self, bb, x, y, w, function() self:run("quick") end)

    D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
    -- Back to the tab the book was opened from, named like on the Kindle.
    local label = G_reader_settings:readSetting("lexeme_tab") == "library" and "Library" or "Home"
    local label_w = D.text(bb, x + D.s(111), y + D.s(169), D.face("regular", 36), label)
    self:pressable(x, y + D.s(100), D.s(260), D.s(112), function() self:run("back") end,
        { x = x + D.s(7), y = y + D.s(108), w = label_w + D.s(137), h = D.s(101) })

    -- box and box_w: the square the Kindle shows pressed.
    local buttons = {
        { action = "aa", x = 795, box = 762, box_w = 101 },
        { action = "goto", icon = "list-toc", x = 891, size = 44, box = 863, box_w = 100 },
        { action = "notebook", icon = "notebook", x = 992, size = 38, box = 963, box_w = 101 },
        { action = "search", icon = "search", x = 1090, size = 48, box = 1063, box_w = 101 },
        { action = "more", icon = "ellipsis-vertical", x = 1195, size = 38, box = 1164, box_w = 101 },
    }
    for _, b in ipairs(buttons) do
        if b.icon then
            local size = D.s(b.size)
            D.icon(bb, b.icon, x + D.s(b.x), y + D.s(158) - math.floor(size / 2), size, size)
        else
            D.text(bb, x + D.s(b.x), y + D.s(170), D.face("regular", 36), "Aa")
        end
        self:pressable(x + D.s(b.x - 25), y + D.s(100), D.s(100), D.s(112), function()
            if b.action == "more" then
                self:openMore(x + w)
            else
                self:run(b.action)
            end
        end, { x = x + D.s(b.box), y = y + D.s(108), w = D.s(b.box_w), h = D.s(101) })
    end
    self:paintTimer(bb, x, y)
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))

    local title = self.ui.doc_props and self.ui.doc_props.display_title or ""
    D.text(bb, x + D.s(39), y + D.s(287), D.face("bold", 32), title, D.BLACK, w - D.s(78))
    D.rect(bb, x, y + D.s(334), w, D.s(4))
end

-- A running reading timer shows in the gap between Home and the buttons: the time left, and a
-- line under it that fills as the time passes.
function Toolbar:paintTimer(bb, x, y)
    if not Timer.isRunning() then return end
    local face = D.face("regular", 32)
    local label = Timer.shortLabel(Timer.minutesLeft()) .. " left"
    local icon, gap = D.s(40), D.s(12)
    local group_w = icon + gap + D.width(face, label)
    local left = x + D.s(511) - math.floor(group_w / 2)
    D.icon(bb, "timer", left, y + D.s(132), icon, icon)
    D.text(bb, left + icon + gap, y + D.s(164), face, label)
    local line_y = y + D.s(186)
    D.rect(bb, left, line_y, group_w, D.s(2), D.gray(170))
    local passed = math.floor(group_w * Timer.progress() + 0.5)
    if passed > 0 then D.rect(bb, left, line_y - D.s(1), passed, D.s(4)) end
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
    Menu:new{ items = items, right = right - D.s(37), top = D.s(223) }:show()
end

-- The progress under the chapter title follows the reading progress chosen under the page (a tap
-- on it there cycles it): Location or Page with the time left in the chapter, or a time on its own.
local function progressLine(ui)
    local mode = require("lexeme/footer").mode()
    local percent = Progress.percent(ui) .. "%"
    local chapter = Progress.chapterTimeLeft(ui) .. " left in chapter"
    if mode == "chapter_time" then return chapter .. " | " .. percent end
    if mode == "book_time" then return Progress.bookTimeLeft(ui) .. " left in book | " .. percent end
    local location, locations = require("lexeme/locations").current(ui)
    local where
    if mode == "page" or not location then
        where = string.format("Page %s of %s", Progress.pageLabel(ui), Progress.pageCountLabel(ui))
    else
        where = string.format("Location %d of %d", location, locations or location)
    end
    return where .. " | " .. chapter .. " | " .. percent
end

function Toolbar:paintBottom(bb, x, y, w)
    local ui = self.ui
    D.rect(bb, x, y, w, D.s(BOTTOM_HEIGHT), D.WHITE)
    D.rect(bb, x, y, w, D.s(4))

    D.textCenter(bb, x + w / 2, y + D.s(1526 - 1473), D.face("regular", 36), Progress.chapter(ui), D.BLACK,
        w - D.s(260))
    local page, count = Progress.page(ui), Progress.pageCount(ui)
    D.textCenter(bb, x + w / 2, y + D.s(1573 - 1473), D.face("regular", 32), progressLine(ui), D.BLACK,
        w - D.s(260))

    local prev_chapter = ui.toc:getPreviousChapter(page)
    local next_chapter = ui.toc:getNextChapter(page)
    D.icon(bb, prev_chapter and "skip-back" or "skip-back-gray", x + D.s(45), y + D.s(1518 - 1473), D.s(40), D.s(40))
    D.icon(bb, next_chapter and "skip-forward" or "skip-forward-gray",
        x + w - D.s(1272 - 1188), y + D.s(1518 - 1473), D.s(40), D.s(40))
    if prev_chapter then
        self:pressable(x, y + D.s(20), D.s(130), D.s(100), function() self:jump(prev_chapter) end,
            D.around(x + D.s(65), y + D.s(65), D.s(101), D.s(101)))
    end
    if next_chapter then
        self:pressable(x + w - D.s(130), y + D.s(20), D.s(130), D.s(100), function() self:jump(next_chapter) end,
            D.around(x + w - D.s(64), y + D.s(65), D.s(101), D.s(101)))
    end

    D.icon(bb, "layout-grid", x + D.s(39), y + D.s(1626 - 1473), D.s(52), D.s(52))
    self:pressable(x, y + D.s(130), D.s(140), D.s(93), function() self:run("pages") end,
        { x = x + D.s(14), y = y + D.s(1592 - 1473), w = D.s(101), h = D.s(104) })

    C.slider(self, bb, {
        x0 = x + D.s(186), x1 = x + D.s(1086), cy = y + D.s(1643 - 1473),
        min = 1, max = count, value = page, continuous = true,
        knob = D.s(60), thick = D.s(12), thin = D.s(3),
        on_change = function(value) self:jump(math.floor(value + 0.5)) end,
    })
end

function Toolbar:jump(page)
    Progress.goToPage(self.ui, page)
    self:refresh()
end

function Toolbar.show(ui, actions)
    local toolbar = Toolbar:new{ ui = ui, actions = actions, region = nil }
    UIManager:show(toolbar, "ui")
    return toolbar
end

return Toolbar
