-- The dictionary entry each looked-up word was shown under ("absorb" for "absorbed").
local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")

local Headwords = {}

local function store()
    return LuaSettings:open(DataStorage:getSettingsDir() .. "/lexeme_headwords.lua")
end

function Headwords.remember(word, headword)
    if not (word and headword) or headword == "" then return end
    local key = word:lower()
    local settings = store()
    if settings:readSetting(key) == headword then return end
    settings:saveSetting(key, headword)
    settings:flush()
end

function Headwords.of(word)
    if not word then return end
    return store():readSetting(word:lower())
end

return Headwords
