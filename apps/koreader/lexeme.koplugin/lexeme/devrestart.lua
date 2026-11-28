--[[
For developing Lexeme on a Kindle: when /mnt/us/lexeme-dev exists, scripts/deploy.sh asks for a
restart by creating restart-request there, and KOReader restarts in place, as Lexeme's own
"Restart KOReader" does.

Killing KOReader from outside and launching it again makes its launcher start the Kindle's own
services and stop them again moments later; a launch that lands while they're still coming up can
fail to read the frontlight or battery, or take the Kindle down with it.

While stay-awake exists there, the Kindle doesn't sleep, so it stays on SSH: powerd's screensaver
timer is held off, and so is KOReader's own auto-suspend, which on a Kindle presses the power
button and so ignores powerd's hold. Deleting the file lets both run again. As with KOReader's Keep
alive, PluginShare.keepalive is set too: auto-suspend then stops resetting powerd's screensaver
timer, which with the screensaver held off blocked KOReader for good in powerd's reply.
]]
local PluginShare = require("pluginshare")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")

local DIR = "/mnt/us/lexeme-dev"
local REQUEST = DIR .. "/restart-request"
local AWAKE = DIR .. "/stay-awake"
local INTERVAL = 2

local DevRestart = {}

local watching = false
local awake = false

local function stayAwake(on)
    if on == awake then return end
    awake = on
    PluginShare.pause_auto_suspend = on
    PluginShare.keepalive = on
    os.execute("lipc-set-prop com.lab126.powerd preventScreenSaver " .. (on and 1 or 0))
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
