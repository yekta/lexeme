-- The panel the handle at the top of the screen pulls down: quick toggles, brightness and warmth.
local Device = require("device")
local Event = require("ui/event")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")

local C = require("lexeme/controls")
local D = require("lexeme/draw")
local Status = require("lexeme/status")
local View = require("lexeme/view")

local Quick = View:extend{
    background = false,
    -- Opens Lexeme's settings; provided by whoever shows the panel.
    open_settings = nil,
}

local PANEL_HEIGHT = 1184

function Quick:init()
    View.init(self)
    self.covers_fullscreen = false
    self.name = Status.deviceName()
end

local function dateLine()
    return Status.clock() .. "  •  " .. os.date("%b ") .. tonumber(os.date("%d")) .. os.date(", %Y")
end

function Quick:button(bb, cx, cy, icon, label, on, on_tap)
    local size = D.s(101)
    D.icon(bb, on and "circle-button-on" or "circle-button", cx - math.floor(size / 2), cy - math.floor(size / 2),
        size, size)
    D.icon(bb, on and icon .. "-white" or icon, cx - D.s(26), cy - D.s(26), D.s(52), D.s(52))
    D.textCenter(bb, cx, cy + D.s(100), D.face("regular", 32), label)
    self:pressable(cx - D.s(150), cy - D.s(60), D.s(300), D.s(180), on_tap,
        D.around(cx, cy, D.s(95), D.s(95), { radius = D.s(48) }))
end

function Quick:render(bb, x, y, w, h)
    local bottom = y + D.s(PANEL_HEIGHT)
    D.scrim(bb, x, bottom, w, h - D.s(PANEL_HEIGHT))
    self:hit(x, bottom, w, h - D.s(PANEL_HEIGHT), function() self:close() end)
    self:hit(x, y, w, D.s(PANEL_HEIGHT), function() end)
    D.rect(bb, x, y, w, D.s(PANEL_HEIGHT), D.WHITE)
    D.rect(bb, x, bottom - D.s(4), w, D.s(4))

    D.text(bb, x + D.s(37), y + D.s(71), D.face("bold", 40), self.name, D.BLACK, w - D.s(400))
    local power = Device:getPowerDevice()
    local level = power:getCapacity()
    Status.paintBattery(bb, x + w - D.s(94), y + D.s(47), level, power:isCharging())
    D.textRight(bb, x + w - D.s(111), y + D.s(71), D.face("regular", 34), level .. "%")
    D.text(bb, x + D.s(40), y + D.s(129), D.face("regular", 32), dateLine())

    local airplane = not NetworkMgr:isWifiOn()
    self:button(bb, x + D.s(159), y + D.s(262), "plane", airplane and "On" or "Off", airplane, function()
        if airplane then NetworkMgr:toggleWifiOn() else NetworkMgr:toggleWifiOff() end
        UIManager:scheduleIn(1, function() self:refresh() end)
    end)
    local night = G_reader_settings:isTrue("night_mode")
    self:button(bb, x + D.s(477), y + D.s(262), "contrast", "Dark Mode", night, function()
        UIManager:broadcastEvent(Event:new("ToggleNightMode"))
        self:refresh("full")
    end)
    self:button(bb, x + D.s(795), y + D.s(262), "refresh-cw", "Sync", false, function()
        self:close()
        UIManager:broadcastEvent(Event:new("LexemeSync"))
    end)
    self:button(bb, x + D.s(1113), y + D.s(262), "settings", "All Settings", false, function()
        self:close()
        if self.open_settings then UIManager:nextTick(self.open_settings) end
    end)

    D.rect(bb, x, y + D.s(467), w, D.s(2), D.gray(136))

    if Device:hasFrontlight() then
        D.text(bb, x + D.s(68), y + D.s(539), D.face("regular", 32), "Brightness")
        C.slider(self, bb, {
            x0 = x + D.s(177), x1 = x + D.s(1096), cy = y + D.s(652),
            min = power.fl_min, max = power.fl_max, value = power:frontlightIntensity(),
            knob = D.s(69), thick = D.s(10), thin = D.s(3), label = true, buttons = true,
            on_change = function(v)
                power:setIntensity(math.floor(v + 0.5))
                self:refresh()
            end,
        })
    end
    if Device:hasNaturalLight() then
        D.text(bb, x + D.s(66), y + D.s(779), D.face("regular", 32), "Warmth")
        local warmth = math.floor(power:frontlightWarmth() * 24 / 100 + 0.5)
        C.slider(self, bb, {
            x0 = x + D.s(177), x1 = x + D.s(1096), cy = y + D.s(888),
            min = 0, max = 24, value = warmth,
            knob = D.s(69), thick = D.s(10), thin = D.s(3), label = true, buttons = true,
            on_change = function(v)
                power:setWarmth(math.floor(math.floor(v + 0.5) * 100 / 24 + 0.5))
                self:refresh()
            end,
        })
    end

    local hw = D.s(111)
    D.icon(bb, "handle-up", x + math.floor((w - hw) / 2), y + D.s(1089), hw, D.s(23))
    local hx = x + math.floor((w - hw) / 2)
    self:hit(hx - D.s(80), y + D.s(1044), hw + D.s(160), D.s(110), function() self:close() end)
end

function Quick:onSwipe(direction)
    if direction == "north" then self:close() end
    return true
end

return Quick
