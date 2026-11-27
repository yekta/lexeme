--[[
Bluetooth through the Kindle's own Bluetooth service (com.lab126.btfd), as Amazon's Settings
uses it: on and off, and connecting a device already paired there. Pairing stays in Amazon's
Settings; nothing here pairs, scans or forgets.
]]
local logger = require("logger")

local Bluetooth = {}

local SERVICE = "com.lab126.btfd"
-- "<on>:<mode>", as Amazon's own Bluetooth switch sends it; mode 6 is plain Bluetooth audio,
-- not VoiceView's screen-reader mode (1).
local ON, OFF = "1:6", "0:6"
local CACHE_SECONDS = 5
-- After a switch or a connection, the state is read afresh while the service catches up.
local SETTLE_SECONDS = 10

local function call(fn)
    local ok, lipc = pcall(require, "libopenlipclua")
    local handle = ok and lipc and lipc.open_no_name()
    if not handle then return nil end
    local done, result = pcall(fn, handle)
    handle:close()
    if not done then
        logger.warn("Lexeme: Bluetooth", result)
        return nil
    end
    return result
end

-- Amazon's BTstate: 0 off, 1 on, 2 connected; nil without the service.
local function readState()
    return call(function(handle) return handle:get_int_property(SERVICE, "BTstate") end)
end

local cached_state, cached_at, settling_until

local function changed()
    cached_at = nil
    settling_until = os.time() + SETTLE_SECONDS
end

function Bluetooth.state()
    local state = readState()
    cached_state, cached_at = state, os.time()
    return state or 0
end

-- Whether this Kindle has Amazon's Bluetooth service.
function Bluetooth.available()
    if Bluetooth.has_service == nil then Bluetooth.has_service = readState() ~= nil end
    return Bluetooth.has_service
end

function Bluetooth.isOn()
    return Bluetooth.state() > 0
end

-- For the status bar, which paints often: the state read at most every few seconds.
function Bluetooth.stateCached()
    if not Bluetooth.available() then return 0 end
    local now = os.time()
    if not cached_at or now - cached_at >= CACHE_SECONDS or (settling_until and now < settling_until) then
        Bluetooth.state()
    end
    return cached_state or 0
end

function Bluetooth.setOn(on)
    changed()
    return call(function(handle)
        handle:set_string_property(SERVICE, "BTenable", on and ON or OFF)
        return true
    end)
end

local function truthy(value)
    return value == true or tonumber(value) == 1
end

-- The devices paired in Amazon's Settings: { address, name, connected }, connected first.
function Bluetooth.paired()
    local list = call(function(handle)
        local input = handle:new_hasharray()
        local ok, result = pcall(function() return handle:access_hash_property(SERVICE, "ListPaired", input) end)
        input:destroy()
        local devices = {}
        if ok and result then
            for _, entry in ipairs(result:to_table() or {}) do
                if entry.bd_address and entry.bd_address ~= "" then
                    local name = entry.bd_name and entry.bd_name ~= "" and entry.bd_name or entry.bd_address
                    table.insert(devices, { address = entry.bd_address, name = name,
                        connected = truthy(entry.is_connected) })
                end
            end
            result:destroy()
        end
        return devices
    end) or {}
    table.sort(list, function(a, b)
        if a.connected ~= b.connected then return a.connected end
        return a.name < b.name
    end)
    return list
end

function Bluetooth.connectedName()
    for _, device in ipairs(Bluetooth.paired()) do
        if device.connected then return device.name end
    end
end

function Bluetooth.connect(address)
    changed()
    return call(function(handle)
        handle:set_string_property(SERVICE, "Connect", address)
        return true
    end)
end

function Bluetooth.disconnect(address)
    changed()
    return call(function(handle)
        handle:set_string_property(SERVICE, "Disconnect", address)
        return true
    end)
end

return Bluetooth
