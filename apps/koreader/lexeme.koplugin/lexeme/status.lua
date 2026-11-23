-- The status line at the top of every screen: clock, pull-down handle, Wi-Fi and battery.
local Device = require("device")
local NetworkMgr = require("ui/network/manager")

local D = require("lexeme/draw")

local Status = { HEIGHT = 90 }

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

function Status.paintBattery(bb, x, y, level, charging)
    D.border(bb, x, y, D.s(50), D.s(26), D.s(3))
    D.rect(bb, x + D.s(50), y + D.s(9), D.s(10), D.s(11))
    local full = D.s(36)
    D.rect(bb, x + D.s(7), y + D.s(7), math.floor(full * level / 100 + 0.5), D.s(13))
    if charging then
        D.rect(bb, x + D.s(7), y + D.s(12), full, D.s(3), D.WHITE)
    end
end

-- Paints the status line across the top of a view and returns its height.
function Status.paint(view, bb, x, y, w, on_handle)
    D.text(bb, x + D.s(32), y + D.s(59), D.face("regular", 28), Status.clock())

    local hw, hh = D.s(130), D.s(22)
    local hx = x + math.floor((w - hw) / 2)
    D.icon(bb, "handle", hx, y + D.s(23), hw, hh)
    if on_handle then view:hit(hx - D.s(60), y, hw + D.s(120), D.s(Status.HEIGHT), on_handle) end

    local power = Device:getPowerDevice()
    local level = power:getCapacity()
    Status.paintBattery(bb, x + w - D.s(86), y + D.s(37), level, power:isCharging())
    local percent_right = x + w - D.s(94)
    local text_w = D.textRight(bb, percent_right, y + D.s(59), D.face("regular", 28), level .. "%")
    if NetworkMgr:isWifiOn() then
        local icon = NetworkMgr:isConnected() and "wifi" or "wifi-off"
        D.icon(bb, icon, percent_right - text_w - D.s(63), y + D.s(30), D.s(44), D.s(44))
    end
    return D.s(Status.HEIGHT)
end

return Status
