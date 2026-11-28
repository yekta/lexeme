--[[
For developing Lexeme on a Kindle: when /mnt/us/lexeme-dev exists, scripts/deploy.sh asks for a
restart by creating restart-request there, and KOReader restarts in place, as Lexeme's own
"Restart KOReader" does.

Killing KOReader from outside and launching it again makes its launcher start the Kindle's own
services and stop them again moments later; a launch that lands while they're still coming up can
fail to read the frontlight or battery, or take the Kindle down with it.

While stay-awake exists there, the Kindle doesn't go to sleep on its own, so it stays on SSH; the
power button still puts it to sleep. KOReader's own auto-suspend is paused, and powerd's screensaver
timer (10 minutes at the least) is reset every 4 minutes, as KOReader does while it's being used.
That's done from a background process: a lipc call that never returns (powerd once kept KOReader
waiting for an hour) can't hold KOReader up. powerd's screensaver itself isn't held off, which
would keep the button from working too. Deleting the file lets both timers run again.
]]
local PluginShare = require("pluginshare")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")

local DIR = "/mnt/us/lexeme-dev"
local REQUEST = DIR .. "/restart-request"
local AWAKE = DIR .. "/stay-awake"
local INTERVAL = 2
local T1_RESET = 4 * 60

local DevRestart = {}

local watching = false
local awake = false
local last_reset

local function lipc(args)
    os.execute("lipc-set-prop " .. args .. " >/dev/null 2>&1 &")
end

local function stayAwake(on)
    if on and (not last_reset or os.time() - last_reset >= T1_RESET) then
        last_reset = os.time()
        lipc("-i com.lab126.powerd touchScreenSaverTimeout 1")
    end
    if on == awake then return end
    awake = on
    PluginShare.pause_auto_suspend = on
    if not on then last_reset = nil end
    -- An earlier stay-awake held powerd's screensaver off; that ends here.
    if on then lipc("com.lab126.powerd preventScreenSaver 0") end
end

local function restart()
    local ReaderUI = require("apps/reader/readerui")
    local FileManager = require("apps/filemanager/filemanager")
    if ReaderUI.instance then ReaderUI.instance:onClose() end
    if FileManager.instance then FileManager.instance:onClose() end
    UIManager:restartKOReader()
end

function DevRestart.watch()
    if watching or lfs.attributes(DIR, "mode") ~= "directory" then return end
    watching = true
    local function check()
        stayAwake(lfs.attributes(AWAKE, "mode") == "file")
        if lfs.attributes(REQUEST, "mode") == "file" then
            os.remove(REQUEST)
            restart()
            return
        end
        UIManager:scheduleIn(INTERVAL, check)
    end
    UIManager:scheduleIn(INTERVAL, check)
end

return DevRestart
