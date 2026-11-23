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
-- or Sync is tapped in Quick Actions.
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

function Lexeme:onLexemeSync()
    local Sync = require("lexeme/sync")
    local Toast = require("lexeme/toast")
    if not Sync.isConnected() then return Toast.show("Connect to Lexeme in Settings first.") end
    Toast.show("Syncing with Lexeme…")
    UIManager:nextTick(function()
        Sync.run(function(_, message) Toast.show(message) end)
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
