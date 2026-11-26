--[[
KOReader freezes the Kindle's volumd so a USB cable can't take the storage it
runs from. Waking, the Kindle's connection manager waits 10 s for volumd before
it routes any traffic, so volumd runs for a moment after a wake, unless a cable
is in.
]]
local Device = require("device")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")

local Network = {}

local THAW_SECONDS = 20
local POWER_SUPPLIES = "/sys/class/power_supply"

local function read(path)
    local file = io.open(path, "r")
    if not file then return nil end
    local text = file:read("*a")
    file:close()
    return text
end

-- Whether traffic can leave the local network. Where the route table can't be read, it's assumed it can.
function Network.hasRoute()
    local routes = read("/proc/net/route")
    if not routes then return true end
    return routes:match("\n%S+%s+00000000%s") ~= nil
end

local function cableIn()
    if lfs.attributes(POWER_SUPPLIES, "mode") ~= "directory" then return false end
    for name in lfs.dir(POWER_SUPPLIES) do
        local dir = POWER_SUPPLIES .. "/" .. name
        local kind = (read(dir .. "/type") or ""):match("%S+")
        local online = (read(dir .. "/online") or ""):match("%S+")
        if (kind == "USB" or kind == "Mains") and online == "1" then return true end
    end
    return false
end

local function frozenVolumd()
    local pidof = io.popen("pidof volumd")
    if not pidof then return nil end
    local pid = pidof:read("*n")
    pidof:close()
    if not pid then return nil end
    local stat = read("/proc/" .. pid .. "/stat")
    if not stat or stat:match("^%d+ %b() (%a)") ~= "T" then return nil end
    return pid
end

local thawed_pid
local thawed_at

local function refreeze()
    UIManager:unschedule(refreeze)
    if not thawed_pid then return end
    if not Network.hasRoute() and os.time() - thawed_at < THAW_SECONDS then
        return UIManager:scheduleIn(1, refreeze)
    end
    os.execute("kill -STOP " .. thawed_pid)
    thawed_pid = nil
end

function Network.afterWake()
    if not Device:isKindle() or thawed_pid or cableIn() then return end
    local pid = frozenVolumd()
    if not pid then return end
    os.execute("kill -CONT " .. pid)
    thawed_pid, thawed_at = pid, os.time()
    UIManager:scheduleIn(1, refreeze)
end

function Network.beforeSleep()
    thawed_at = 0
    refreeze()
end

return Network
