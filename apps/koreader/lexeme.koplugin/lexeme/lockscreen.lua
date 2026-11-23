--[[
What the Kindle shows while asleep: the book's cover, or one of Amazon's own
lock-screen illustrations, with no "Sleeping" message over it.
]]
local DataStorage = require("datastorage")
local lfs = require("libs/libkoreader-lfs")

local Lockscreen = {}

local AMAZON_DIR = "/usr/share/blanket/screensaver"

local function imagesDir()
    return DataStorage:getDataDir() .. "/lexeme-lockscreen"
end

local function copy(from, to)
    local input = io.open(from, "rb")
    if not input then return end
    local output = io.open(to, "wb")
    if output then
        output:write(input:read("*a"))
        output:close()
    end
    input:close()
end

-- KOReader can only pick from a folder, and Amazon's folder also holds the
-- Kids illustrations and overlays, so the regular ones are copied out once.
local function ensureImages()
    local dir = imagesDir()
    if lfs.attributes(dir, "mode") == "directory" then return true end
    if lfs.attributes(AMAZON_DIR, "mode") ~= "directory" then return false end
    lfs.mkdir(dir)
    for file in lfs.dir(AMAZON_DIR) do
        if file:match("^bg_ss%d+%.png$") then copy(AMAZON_DIR .. "/" .. file, dir .. "/" .. file) end
    end
    return true
end

function Lockscreen.showsCovers()
    return G_reader_settings:readSetting("screensaver_type") == "cover"
end

function Lockscreen.setCovers(covers)
    if covers then
        G_reader_settings:saveSetting("screensaver_type", "cover")
    elseif ensureImages() then
        G_reader_settings:saveSetting("screensaver_type", "random_image")
        G_reader_settings:saveSetting("screensaver_dir", imagesDir())
    else
        G_reader_settings:saveSetting("screensaver_type", "disable")
    end
end

function Lockscreen.setup()
    G_reader_settings:saveSetting("screensaver_show_message", false)
    G_reader_settings:saveSetting("screensaver_hide_fallback_msg", true)
    G_reader_settings:saveSetting("screensaver_img_background", "white")
    if not Lockscreen.showsCovers() then Lockscreen.setCovers(false) end
end

return Lockscreen
