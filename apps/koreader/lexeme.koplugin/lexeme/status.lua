-- The status line at the top of every screen: clock, pull-down handle, Wi-Fi and battery.
local Device = require("device")
local NetworkMgr = require("ui/network/manager")
local lfs = require("libs/libkoreader-lfs")

local Bluetooth = require("lexeme/bluetooth")
local D = require("lexeme/draw")

local Status = { HEIGHT = 90 }

-- Amazon's own status bar icons, used where the Kindle has them.
local KINDLE_ICONS = "/app/KPPMainApp/res/core/systemStatus/"
local CONNECTED = 2
local kindle_icons = {}

local function kindleIcon(name)
    if kindle_icons[name] == nil then
        local path = KINDLE_ICONS .. name .. ".svg"
        kindle_icons[name] = lfs.attributes(path, "mode") == "file" and path or false
    end
    return kindle_icons[name] or nil
end

-- The name the Kindle was registered with ("Y's Kindle"), or "Kindle".
function Status.deviceName()
    local file = io.open("/var/local/java/prefs/reginfo", "r")
    if not file then return "Kindle" end
    local name
    for line in file:lines() do
        name = line:match("^deviceName=(.+)$")
        if name then break end
    end
    file:close()
    return name or "Kindle"
end

-- The time as the Kindle shows it, for `at` (epoch seconds) or now.
function Status.clock(at)
    local hour = tonumber(os.date("%H", at))
    if G_reader_settings:isFalse("lexeme_twelve_hour_clock") then
        return string.format("%02d:%s", hour, os.date("%M", at))
    end
    local suffix = hour < 12 and "AM" or "PM"
    hour = hour % 12
    if hour == 0 then hour = 12 end
    return string.format("%d:%s %s", hour, os.date("%M", at), suffix)
end

-- Paints a rectangle with fractional edges, shading the pixels it partly covers, on white.
local function paintCovered(bb, x0, y0, x1, y1)
    for py = math.floor(y0), math.ceil(y1) - 1 do
        local cy = math.min(y1, py + 1) - math.max(y0, py)
        for px = math.floor(x0), math.ceil(x1) - 1 do
            local cover = cy * (math.min(x1, px + 1) - math.max(x0, px))
            D.rect(bb, px, py, 1, 1, D.gray(math.floor(255 * (1 - cover) + 0.5)))
        end
    end
end

-- Amazon's battery, measured off its status bar: the outline and the charging bolt are icons,
-- the level fills 35.5 px inside them, starting 7.15 px in from the corner.
function Status.paintBattery(bb, x, y, level, charging)
    D.icon(bb, charging and "battery-charging" or "battery", x, y, D.s(58), D.s(29))
    if charging or level <= 0 then return end
    local k = D.s(1000) / 1000
    local left, top = x + 7.15 * k, y + 7.15 * k
    paintCovered(bb, left, top, left + 35.5 * k * math.min(level, 100) / 100, y + 21.35 * k)
end

-- Paints the status line across the top of a view and returns its height.
function Status.paint(view, bb, x, y, w, on_handle)
    local clock_w = D.text(bb, x + D.s(32), y + D.s(59), D.face("regular", 28), Status.clock())
    -- Dev mode (scripts/dev-mode.sh) pauses syncing; it says so, so it isn't left on.
    if G_reader_settings:isTrue("lexeme_dev_mode") then
        local face = D.face("bold", 28)
        local bx, bw = x + D.s(32) + clock_w + D.s(18), D.width(face, "Dev Mode") + D.s(16)
        D.roundRect(bb, bx, y + D.s(29), bw, D.s(42), D.BLACK, D.s(8))
        D.text(bb, bx + D.s(8), y + D.s(59), face, "Dev Mode", D.WHITE)
    end

    local hw, hh = D.s(130), D.s(22)
    local hx = x + math.floor((w - hw) / 2)
    D.icon(bb, "handle", hx, y + D.s(23), hw, hh)
    if on_handle then view:hit(hx - D.s(60), y, hw + D.s(120), D.s(Status.HEIGHT), on_handle) end

    local power = Device:getPowerDevice()
    local level = power:getCapacity()
    Status.paintBattery(bb, x + w - D.s(86), y + D.s(37), level, power:isCharging())
    D.textRight(bb, x + w - D.s(93), y + D.s(60), D.face("regular", 28), level .. "%")
    -- Amazon keeps the Wi-Fi icon in place however wide the percentage is, Bluetooth beside it, and a
    -- speaker beside that while a Bluetooth audio device is connected.
    local bluetooth = Bluetooth.stateCached()
    if bluetooth > 0 then
        local icon = kindleIcon("Bluetooth")
        if icon then
            D.icon(bb, icon, x + w - D.s(268.5), y + D.s(35), D.s(19.5), D.s(33))
        else
            D.icon(bb, "bluetooth", x + w - D.s(282), y + D.s(31), D.s(38), D.s(38))
        end
    end
    local speaker = bluetooth == CONNECTED and kindleIcon("Volume")
    if speaker then D.icon(bb, speaker, x + w - D.s(337.5), y + D.s(33), D.s(37), D.s(37)) end
    if NetworkMgr:isConnected() then
        D.icon(bb, "status-wifi", x + w - D.s(216), y + D.s(33), D.s(44), D.s(34))
    elseif NetworkMgr:isWifiOn() then
        D.icon(bb, "wifi-off", x + w - D.s(216), y + D.s(30), D.s(44), D.s(44))
    end
    return D.s(Status.HEIGHT)
end

return Status
