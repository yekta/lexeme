-- What a tap or a long press does on each part of the page, measured on the Kindle's reader.
local Event = require("ui/event")
local Geom = require("ui/geometry")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")

local D = require("lexeme/draw")
local Footer = require("lexeme/footer")
local Layout = require("lexeme/layout")

local Zones = {}

local BACK_WIDTH = 1 / 7
local TOOLBAR_HEIGHT = 1 / 5
local BOOKMARK_CORNER = 130
local EVERYWHERE = { ratio_x = 0, ratio_y = 0, ratio_w = 1, ratio_h = 1 }

local function ribbon()
    return Geom:new{ x = Screen:getWidth() - D.s(48 + 39), y = 0, w = D.s(39), h = D.s(63) }
end

-- The Kindle's bookmark: a black ribbon with a notched end, in place of KOReader's dog-ear.
local function paintRibbon(_, bb, x, y)
    local box = ribbon()
    local notch = D.s(14)
    local left, top = x + box.x, y + box.y
    D.rect(bb, left, top + 1, box.w, box.h - notch - 1)
    local center = left + box.w / 2
    for i = 1, notch do
        local gap = box.w / 2 * i / (notch + 1)
        local row = top + box.h - notch + i - 1
        D.rect(bb, left, row, math.floor(center - gap - left + 0.5), 1)
        local right_start = math.floor(center + gap + 0.5)
        D.rect(bb, right_start, row, left + box.w - right_start, 1)
    end
end

local function inFooter(ges)
    return ges.pos.y >= Footer.top()
end

local function tapFooter(ui, ges)
    if not inFooter(ges) or ges.pos.x > Footer.progressRight(ui) then return end
    G_reader_settings:saveSetting("lexeme_progress_mode", Footer.nextMode())
    local w, top = Screen:getWidth(), Footer.top()
    UIManager:setDirty(ui.dialog, function()
        return "ui", Geom:new{ x = 0, y = top, w = w, h = Screen:getHeight() - top }
    end)
    return true
end

-- A long press does nothing on the progress line or the right margin, and turns back a page on the left margin.
local function holdOutsideText(ui, ges)
    if inFooter(ges) then return true end
    if not ui.rolling then return end
    local margin = Layout.sideMargin()
    if ges.pos.x < margin then
        ui:handleEvent(Event:new("GotoViewRel", -1))
        return true
    end
    return ges.pos.x >= Screen:getWidth() - margin or nil
end

function Zones.install(ui)
    local back = { ratio_x = 0, ratio_y = 0, ratio_w = BACK_WIDTH, ratio_h = 1 }
    local forward = { ratio_x = BACK_WIDTH, ratio_y = 0, ratio_w = 1 - BACK_WIDTH, ratio_h = 1 }
    ui.view.getTapZones = function() return forward, back end
    local pages = ui.rolling or ui.paging
    pages:setupTouchZones()

    ui.view.dogear.paintTo = paintRibbon
    ui.view.dogear.getRefreshRegion = ribbon

    local w, h = Screen:getWidth(), Screen:getHeight()
    local corner = D.s(BOOKMARK_CORNER)
    ui:unRegisterTouchZones({ { id = "readermenu_ext_tap" } })
    ui:registerTouchZones({
        {
            id = "readermenu_tap",
            ges = "tap",
            screen_zone = { ratio_x = 0, ratio_y = 0, ratio_w = 1, ratio_h = TOOLBAR_HEIGHT },
            overrides = { "tap_forward", "tap_backward" },
            handler = function(ges) return ui.menu:onTapShowMenu(ges) end,
        },
        {
            id = "lexeme_bookmark_tap",
            ges = "tap",
            screen_zone = { ratio_x = 1 - corner / w, ratio_y = 0, ratio_w = corner / w, ratio_h = corner / h },
            overrides = { "readermenu_tap", "tap_forward", "tap_backward" },
            handler = function() return ui.bookmark:onToggleBookmark() end,
        },
        {
            id = "lexeme_progress_tap",
            ges = "tap",
            screen_zone = EVERYWHERE,
            overrides = { "readerconfigmenu_tap", "readerconfigmenu_ext_tap", "tap_forward", "tap_backward" },
            handler = function(ges) return tapFooter(ui, ges) end,
        },
        {
            id = "lexeme_margin_hold",
            ges = "hold",
            screen_zone = EVERYWHERE,
            overrides = { "readerhighlight_hold" },
            handler = function(ges) return holdOutsideText(ui, ges) end,
        },
    })
end

return Zones
