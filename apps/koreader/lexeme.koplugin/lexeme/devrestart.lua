--[[
For developing Lexeme on a Kindle: when /mnt/us/lexeme-dev exists, scripts/deploy.sh asks for a
restart by creating restart-request there, and KOReader restarts in place, as Lexeme's own
"Restart KOReader" does.

Killing KOReader from outside and launching it again makes its launcher start the Kindle's own
services and stop them again moments later; a launch that lands while they're still coming up can
fail to read the frontlight or battery, or take the Kindle down with it.
]]
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")

local DIR = "/mnt/us/lexeme-dev"
local REQUEST = DIR .. "/restart-request"
local INTERVAL = 2

local DevRestart = {}

local watching = false

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
