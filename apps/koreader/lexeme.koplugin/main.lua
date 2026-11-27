local plugin_root = debug.getinfo(1, "S").source:match("^@(.*)/[^/]*$")
-- KOReader only adds a plugin's folder to package.path while main.lua loads;
-- our modules are required later too.
package.path = plugin_root .. "/?.lua;" .. package.path

local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")

local D = require("lexeme/draw")
local Layout = require("lexeme/layout")
local Lockscreen = require("lexeme/lockscreen")
local Reader = require("lexeme/reader")
local Shell = require("lexeme/shell")

D.setIconDir(plugin_root .. "/icons")
Layout.setStylesheet(plugin_root .. "/kindle.css")
Lockscreen.setup()
-- KOReader would otherwise ask in its own dialog before turning Wi-Fi on or off.
local DEFAULT_SETTINGS = {
    wifi_enable_action = "turn_on",
    wifi_disable_action = "leave_on",
}
for key, value in pairs(DEFAULT_SETTINGS) do
    if G_reader_settings:hasNot(key) then G_reader_settings:saveSetting(key, value) end
end
-- Each book's progress lives in KOReader's own folder: a .sdr folder beside the
-- book is claimed (and emptied) by Amazon's indexer when the book is a PDF.
G_reader_settings:saveSetting("document_metadata_folder", "dir")
-- Lay a book out fully on every change; KOReader's partial relayouts reload the book
-- later, when it's idle, and can land back on an older page.
G_reader_settings:saveSetting("cre_partial_rerendering", false)
-- Vocabulary Builder keeps the sentence each looked-up word was read in, which Lexeme shows.
G_reader_settings:saveSetting("vocabulary_builder", { enabled = true, with_context = true })
-- A Kindle can't take a keyboard; KOReader's External Keyboard plugin mistakes one of its input
-- devices for one, says "Keyboard connected" and switches KOReader to keyboard input.
local plugins_disabled = G_reader_settings:readSetting("plugins_disabled") or {}
plugins_disabled.externalkeyboard = true
G_reader_settings:saveSetting("plugins_disabled", plugins_disabled)
-- The Kindle's FreeType never kerns, and errors when asked before a font has drawn a glyph,
-- which KOReader's text drawing treats as fatal. Its UI text isn't kerned anyway.
local RenderText = require("ui/rendertext")
local KERNING_ARGUMENT = { getSubTextByWidth = 4, sizeUtf8Text = 5, renderUtf8Text = 6 }
for name, position in pairs(KERNING_ARGUMENT) do
    local draw = RenderText[name]
    RenderText[name] = function(self, ...)
        local args = { n = select("#", ...), ... }
        args[position] = false
        return draw(self, unpack(args, 1, math.max(args.n, position)))
    end
end

local Lexeme = WidgetContainer:extend{
    name = "lexeme",
}

function Lexeme:init()
    if self.ui.document then
        Reader.install(self.ui)
        return
    end
    self:createShell()
    -- The file browser paints Home in its place, so its own screen never shows
    -- before Home opens on top of it.
    self.ui.paintTo = function(_, bb, x, y)
        if self.shell then self.shell:paintTo(bb, x, y) end
    end
    UIManager:nextTick(function() UIManager:show(self.shell, "flashui") end)
end

function Lexeme:onPreRenderDocument()
    Reader.beforeRender(self.ui)
end

function Lexeme:onReaderReady()
    Reader.onReaderReady(self.ui)
    require("lexeme/loading").close()
end

-- Lexeme gets what's new whenever the Kindle comes online, a book is put down,
-- the Kindle goes to sleep or wakes up, or Sync is tapped in Quick Actions.
function Lexeme:onNetworkConnected()
    require("lexeme/sync").soon()
end

-- A highlight or note added, changed or removed goes to Lexeme without waiting for the book to close.
function Lexeme:onAnnotationsModified()
    if not self.ui.document then return end
    self.ui:saveSettings()
    require("lexeme/sync").soon()
end

function Lexeme:onCloseDocument()
    require("lexeme/sync").soon()
end

-- Each page read reaches Lexeme with the locations it covered.
function Lexeme:onPageUpdate(page)
    if self.ui.document then require("lexeme/locations").notePage(self.ui, page) end
end

-- Saved with the book's settings, so highlights and pages read reach Lexeme with their Kindle locations.
function Lexeme:onSaveSettings()
    if self.ui.document then require("lexeme/locations").record(self.ui) end
end

function Lexeme:onSuspend()
    require("lexeme/network").beforeSleep()
    require("lexeme/timer").pause()
    require("lexeme/sync").beforeSleep()
end

function Lexeme:onResume()
    require("lexeme/network").afterWake()
    require("lexeme/timer").resume()
    require("lexeme/sync").afterWake()
end

function Lexeme:onLexemeSync()
    local Sync = require("lexeme/sync")
    local Toast = require("lexeme/toast")
    if not Sync.isConnected() then return Toast.show("Connect to Lexeme in Settings first.") end
    local done = Toast.busy("Syncing with Lexeme…")
    UIManager:nextTick(function()
        Sync.run(function(_, message)
            done()
            Toast.show(message)
        end)
    end)
end

function Lexeme:createShell()
    self.shell = Shell:new{
        open_book = function(path) self:openBook(path) end,
        menu_items = function() return self:homeMenuItems() end,
        open_settings = function() self:openSettings() end,
    }
end

-- Home lives in its own window over the file browser; it has to go with it,
-- or KOReader keeps running when the file browser exits.
function Lexeme:onCloseWidget()
    if not self.shell then return end
    UIManager:close(self.shell)
    self.shell = nil
end

function Lexeme:openSettings()
    require("lexeme/settings").show()
end

-- Like the Kindle: the cover says "Opening", then a spinner holds the screen until the book is ready.
function Lexeme:openBook(path)
    if path:find("^lexeme%-delivery:") then return end
    if self.shell then
        G_reader_settings:saveSetting("lexeme_tab", self.shell.tab)
        self.shell.opening = path
        UIManager:setDirty(self.shell, "fast")
        UIManager:forceRePaint()
    end
    UIManager:scheduleIn(0.5, function()
        require("lexeme/loading").show()
        UIManager:nextTick(function()
            require("apps/reader/readerui"):showReader(path, nil, true)
        end)
    end)
end

function Lexeme:homeMenuItems()
    return {
        { text = "Settings", callback = function() self:openSettings() end },
        "-",
        {
            text = "Restart KOReader",
            callback = function() self.ui.menu:exitOrRestart(function() UIManager:restartKOReader() end) end,
        },
        { text = "Exit KOReader", callback = function() self.ui.menu:exitOrRestart() end },
    }
end

return Lexeme
