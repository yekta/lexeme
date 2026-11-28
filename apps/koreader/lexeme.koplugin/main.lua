local plugin_root = debug.getinfo(1, "S").source:match("^@(.*)/[^/]*$")
-- KOReader only adds a plugin's folder to package.path while main.lua loads;
-- our modules are required later too.
package.path = plugin_root .. "/?.lua;" .. package.path

local DocSettings = require("docsettings")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local lfs = require("libs/libkoreader-lfs")

local D = require("lexeme/draw")
local Layout = require("lexeme/layout")
local Lockscreen = require("lexeme/lockscreen")
local Reader = require("lexeme/reader")
local Shell = require("lexeme/shell")

D.setIconDir(plugin_root .. "/icons")
Layout.setStylesheet(plugin_root .. "/kindle.css")
Lockscreen.setup()
local DEFAULT_SETTINGS = {
    -- KOReader would otherwise ask in its own dialog before turning Wi-Fi on or off.
    wifi_enable_action = "turn_on",
    wifi_disable_action = "leave_on",
    -- A hold selects a word a little sooner than KOReader's 500 ms.
    ges_hold_interval_ms = 400,
}
for key, value in pairs(DEFAULT_SETTINGS) do
    if G_reader_settings:hasNot(key) then G_reader_settings:saveSetting(key, value) end
end
-- The gesture detector read its hold interval before plugins load.
require("device/gesturedetector").ges_hold_interval =
    require("ui/time").ms(G_reader_settings:readSetting("ges_hold_interval_ms"))
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
require("lexeme/engine").install()
-- Home always covers KOReader's file browser (Lexeme:init paints Home in its place), so the
-- browser needn't list the home folder each time it's built, as every book closes: for a
-- Kindle's 500 entries through its FUSE layer that took 0.15 s. Other file choosers still list.
local FileChooser = require("ui/widget/filechooser")
local listFolder = FileChooser.genItemTableFromPath
FileChooser.genItemTableFromPath = function(chooser, path)
    if chooser.name == "filemanager" then return {} end
    return listFolder(chooser, path)
end
-- Home shows in the same pass as the file browser it covers, rather than a tick later: a tick
-- later, the browser had painted Home already, and Home was painted all over again (0.35 s).
local FileManager = require("apps/filemanager/filemanager")
local showFiles = FileManager.showFiles
FileManager.showFiles = function(...)
    showFiles(...)
    local lexeme = FileManager.instance and FileManager.instance.lexeme
    if lexeme and lexeme.showShell then lexeme:showShell() end
end
-- KOReader's gesture shortcuts aren't Lexeme's: Reader.onReaderReady emptied them in every book,
-- once the gestures plugin had set them all up, 30 ms each time a book opened. The plugin isn't
-- started in a book now (KOReader works as when it's turned off); Home keeps it.
local PluginLoader = require("pluginloader")
local createPluginInstance = PluginLoader.createPluginInstance
PluginLoader.createPluginInstance = function(loader, plugin, attr)
    if plugin.name == "gestures" and attr and attr.document then return nil, "not used in a book" end
    return createPluginInstance(loader, plugin, attr)
end
-- A book file this big opens without the spinner turning (see Lexeme:openBook).
local BIG_BOOK_BYTES = 8 * 1024 * 1024
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
    require("lexeme/devrestart").watch()
    if self.ui.document then
        Reader.install(self.ui)
        return
    end
    self:useClassicFileBrowser()
    self:createShell()
    -- Home goes up with the file browser, as FileManager:showFiles shows it (see showShell), and
    -- covers all of it: the browser itself is never painted, and Home is painted once. Should the
    -- browser show before Home does, it paints Home in its place, so its own screen never shows.
    self.ui.paintTo = function(_, bb, x, y)
        if not self.shell or self.shell_shown then return end
        self.shell:paintTo(bb, x, y)
        self.shell_painted = true
    end
    UIManager:nextTick(function() self:showShell() end)
    -- The spinner's frames and the engine's start-up, done while Home sits idle rather than as a
    -- book opens.
    UIManager:scheduleIn(3, function()
        if not self.shell then return end
        require("lexeme/loading").prepare()
        require("lexeme/engine").whileIdle()
    end)
end

-- Plugins read their settings after KOReader's own reader modules, and before the book loads.
function Lexeme:onReadSettings()
    if self.ui.document then Reader.beforeLoad(self.ui) end
end

function Lexeme:onPreRenderDocument()
    Reader.beforeRender(self.ui)
end

function Lexeme:onReaderReady()
    self.forgetOpening()
    Reader.onReaderReady(self.ui)
    require("lexeme/loading").close()
    require("lexeme/cachesave").start(self.ui)
end

-- A page turned: the reader has settled there, for "Back to loc …" (lexeme/backstack.lua).
function Lexeme:onPageUpdate()
    if self.ui.document then require("lexeme/backstack").onPageUpdate(self.ui) end
end

-- A book laid out again (a font change) has its cache written again while it's read.
function Lexeme:onDocumentRerendered()
    if self.ui.document then require("lexeme/cachesave").start(self.ui) end
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
    require("lexeme/cachesave").stop()
    require("lexeme/highlight_positions").save(self.ui)
    require("lexeme/sync").soon()
end

function Lexeme:onSuspend()
    require("lexeme/network").beforeSleep()
    require("lexeme/timer").sleep()
    require("lexeme/sync").beforeSleep()
end

function Lexeme:onResume()
    require("lexeme/network").afterWake()
    require("lexeme/timer").wake()
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

-- The file browser under Home is never seen, but in coverbrowser's cover views it loads covers
-- each time Home opens and forces two garbage collections as a book opens.
function Lexeme:useClassicFileBrowser()
    local coverbrowser = self.ui.coverbrowser
    local ok, manager = pcall(require, "bookinfomanager")
    if not (coverbrowser and coverbrowser.setupFileManagerDisplayMode and ok) then return end
    if manager:getSetting("filemanager_display_mode") == nil then return end
    coverbrowser:setupFileManagerDisplayMode(nil)
end

-- Home over the file browser. Once the browser has put Home on the screen, no second refresh.
-- Home flashes up, as on a Kindle, and takes taps as soon as the flash starts (see lexeme/flash).
function Lexeme:showShell()
    if not self.shell or self.shell_shown then return end
    self.shell_shown = true
    UIManager:show(self.shell, not self.shell_painted and "flashui" or nil)
    require("lexeme/flash").nextRepaint()
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
    local search = self.shell.search
    if search then
        search.quiet = true
        UIManager:close(search)
    end
    UIManager:close(self.shell)
    self.shell = nil
end

function Lexeme:openSettings()
    require("lexeme/settings").show()
end

-- KOReader reads a book's settings twice more as it opens it, for the document handler and for the
-- reader. With many highlights the file is big (264 of them: 150 KB, 20-30 ms a read on a Kindle),
-- so the copy read as the cover is tapped serves both, as long as the file hasn't changed since.
local opening
local openSettings = DocSettings.open
DocSettings.open = function(self, path)
    if opening and opening.path == path then
        local file = lfs.attributes(opening.file)
        if file and file.modification == opening.modification and file.size == opening.size then
            return opening.settings
        end
        opening = nil
    end
    return openSettings(self, path)
end

-- The book's layout cache from last time, if it's there.
local function layoutCache(path)
    opening = nil
    local settings = DocSettings:open(path)
    local file = settings.source_candidate and lfs.attributes(settings.source_candidate)
    if file then
        opening = {
            path = path, settings = settings, file = settings.source_candidate,
            modification = file.modification, size = file.size,
        }
    end
    local cache = settings:readSetting("cache_file_path")
    if cache ~= nil and lfs.attributes(cache, "mode") == "file" then return cache end
end

-- Once the reader has the book's settings, they're its own.
function Lexeme.forgetOpening()
    opening = nil
end

-- Like the Kindle: the cover says "Opening" until the book shows. A book that takes longer, being
-- laid out, gets the loading screen, a spinner holding the screen until the book is ready.
function Lexeme:openBook(path)
    if path:find("^lexeme%-delivery:") then return end
    local cache = layoutCache(path)
    -- The cache starts coming into memory now, while the cover and the reader are drawn and set up.
    require("lexeme/engine").readAhead(cache)
    if self.shell then
        G_reader_settings:saveSetting("lexeme_tab", self.shell.tab)
        self.shell:showOpening(path)
    end
    -- Whether the book opens in about a second: it isn't big and its layout is cached.
    local quick = cache ~= nil and (lfs.attributes(path, "size") or 0) <= BIG_BOOK_BYTES
    -- Turning the spinner keeps a copy of KOReader's memory while the book is laid out; a book
    -- this big needs it more than the spinner does.
    local still = (lfs.attributes(path, "size") or 0) > BIG_BOOK_BYTES
    UIManager:nextTick(function()
        if not quick then require("lexeme/loading").show(nil, still) end
        UIManager:nextTick(function()
            require("apps/reader/readerui"):showReader(path, nil, true)
        end)
    end)
end

function Lexeme:homeMenuItems()
    return {
        { text = "Vocabulary Builder", callback = function() require("lexeme/vocabulary_screen").show(self.ui) end },
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
