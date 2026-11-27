--[[
Settings, laid out like the Kindle's: a list of pages, each a list of rows with
a bold title, a subtitle, and a chevron, value or toggle on the right.
]]
local DataStorage = require("datastorage")
local Device = require("device")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local lfs = require("libs/libkoreader-lfs")
local util = require("util")

local Bluetooth = require("lexeme/bluetooth")
local C = require("lexeme/controls")
local D = require("lexeme/draw")
local Status = require("lexeme/status")
local View = require("lexeme/view")
local Words = require("lexeme/words")

local Settings = View:extend{}

function Settings:init()
    View.init(self)
    self.stack = { self:rootPage() }
    self.first_row = 1
end

function Settings:push(page)
    table.insert(self.stack, page)
    self.first_row = 1
    self:refresh("flashui")
end

function Settings:pop()
    if #self.stack == 1 then return self:close("flashui") end
    table.remove(self.stack)
    self.first_row = 1
    self:refresh("flashui")
end

function Settings:current()
    return self.stack[#self.stack]
end

-- Pages ----------------------------------------------------------------------------

-- "Wi-Fi and Bluetooth" on a Kindle with Bluetooth, as Amazon names it.
local function wifiTitle()
    return Bluetooth.available() and "Wi-Fi and Bluetooth" or "Wi-Fi"
end

function Settings:rootPage()
    return {
        title = "Settings",
        icons = true,
        rows = function()
            return {
                { icon = "wifi", title = wifiTitle(), page = function() return self:wifiPage() end },
                { icon = "tablet", title = "Device options", page = function() return self:devicePage() end },
                { icon = "sun", title = "Screen and brightness", page = function() return self:screenPage() end },
                { icon = "book-open-text", title = "Reading options", page = function() return self:readingPage() end },
                { icon = "book-open", title = "Home and Library", page = function() return self:libraryPage() end },
                { icon = "languages", title = "Dictionaries", page = function() return self:dictionariesPage() end },
                { icon = "blocks", title = "Integrations", page = function() return self:integrationsPage() end },
            }
        end,
    }
end

local function accountLabel()
    local Sync = require("lexeme/sync")
    if not Sync.isConnected() then return "Not connected" end
    local email = G_reader_settings:readSetting("lexeme_user_email")
    return email and email ~= "" and email or "Connected"
end

-- The open book, when Settings was opened from the reader; its settings change along with the defaults.
local function openReader()
    return require("apps/reader/readerui").instance
end

local function refreshRateIsEveryPage()
    return UIManager:getRefreshRate() == 1
end

local HOLD_CHOICES_MS = { 200, 250, 300, 350, 400, 450, 500 }

local function holdMs()
    return G_reader_settings:readSetting("ges_hold_interval_ms") or 500
end

-- "0.35 seconds", "0.4 seconds".
local function secondsLabel(ms)
    return (string.format("%.2f", ms / 1000):gsub("0$", "")) .. " seconds"
end

function Settings:holdPage()
    return {
        title = "Hold to select",
        intro = "Set how long to hold a word before it's selected. Shorter is quicker, longer avoids selecting "
            .. "by accident.",
        rows = function()
            local rows = {}
            for _, ms in ipairs(HOLD_CHOICES_MS) do
                table.insert(rows, {
                    title = secondsLabel(ms),
                    plain = true,
                    check = ms == holdMs(),
                    tap = function()
                        G_reader_settings:saveSetting("ges_hold_interval_ms", ms)
                        require("device/gesturedetector").ges_hold_interval = require("ui/time").ms(ms)
                        self:refresh()
                    end,
                })
            end
            return rows
        end,
    }
end

function Settings:readingPage()
    return {
        title = "Reading options",
        rows = function()
            local ui = openReader()
            local statistics = G_reader_settings:readSetting("statistics") or {}
            return {
                {
                    title = "Hyphenation",
                    subtitle = "Break long words at the end of a line.",
                    toggle = G_reader_settings:nilOrTrue("hyphenation"),
                    tap = function()
                        local on = not G_reader_settings:nilOrTrue("hyphenation")
                        G_reader_settings:saveSetting("hyphenation", on)
                        if ui and ui.typography then
                            ui.typography.hyphenation = on
                            ui.doc_settings:saveSetting("hyphenation", on)
                            ui.document:setTextHyphenation(on)
                            ui:handleEvent(require("ui/event"):new("UpdatePos"))
                        end
                        self:refresh()
                    end,
                },
                {
                    title = "Precise text shaping",
                    subtitle = "Shape text with HarfBuzz, as KOReader's Best kerning. "
                        .. "Laying out a book takes about three times as long.",
                    toggle = require("lexeme/layout").kerning() == require("lexeme/layout").KERNING_BEST,
                    tap = function()
                        local Layout = require("lexeme/layout")
                        local best = Layout.kerning() == Layout.KERNING_BEST
                        Layout.setKerning(ui, best and Layout.KERNING_FAST or Layout.KERNING_BEST)
                        self:refresh()
                    end,
                },
                {
                    title = "Publisher font",
                    subtitle = "Use the fonts that come with a book.",
                    toggle = (G_reader_settings:readSetting("copt_embedded_fonts") or 1) == 1,
                    tap = function()
                        local on = (G_reader_settings:readSetting("copt_embedded_fonts") or 1) ~= 1
                        G_reader_settings:saveSetting("copt_embedded_fonts", on and 1 or 0)
                        if ui and ui.typeset then ui.typeset:onToggleEmbeddedFonts(on) end
                        self:refresh()
                    end,
                },
                {
                    title = "Publisher styles",
                    subtitle = "Keep a book's own layout, like its headings, spacing and indents.",
                    toggle = (G_reader_settings:readSetting("copt_embedded_css") or 1) == 1,
                    tap = function()
                        local on = (G_reader_settings:readSetting("copt_embedded_css") or 1) ~= 1
                        G_reader_settings:saveSetting("copt_embedded_css", on and 1 or 0)
                        if ui and ui.typeset then ui.typeset:onToggleEmbeddedStyleSheet(on) end
                        self:refresh()
                    end,
                },
                {
                    title = "Footnotes in a pop-up",
                    subtitle = "Show a footnote over the page instead of jumping to it.",
                    toggle = G_reader_settings:isTrue("footnote_link_in_popup"),
                    tap = function()
                        G_reader_settings:flipNilOrFalse("footnote_link_in_popup")
                        self:refresh()
                    end,
                },
                {
                    title = "Vocabulary Builder",
                    subtitle = "Keep the words you look up, with the sentence you read them in.",
                    toggle = G_reader_settings:nilOrTrue("lexeme_vocabulary_builder"),
                    tap = function()
                        G_reader_settings:flipNilOrTrue("lexeme_vocabulary_builder")
                        self:refresh()
                    end,
                },
                {
                    title = "Hold to select",
                    subtitle = "Set how long to hold a word before it's selected.",
                    value = secondsLabel(holdMs()),
                    page = function() return self:holdPage() end,
                },
                {
                    title = "Page refresh",
                    subtitle = "Refresh the screen fully on every page turn to clear ghosting.",
                    toggle = refreshRateIsEveryPage(),
                    tap = function()
                        local every = not refreshRateIsEveryPage()
                        UIManager:setRefreshRate(every and 1 or 6, every and 1 or 6)
                        self:refresh()
                    end,
                },
                {
                    title = "Reading time",
                    subtitle = "Keep track of how long you read each day. Lexeme uses it for your reading stats.",
                    toggle = statistics.is_enabled ~= false,
                    tap = function()
                        statistics.is_enabled = statistics.is_enabled == false
                        G_reader_settings:saveSetting("statistics", statistics)
                        if ui and ui.statistics then ui.statistics.settings.is_enabled = statistics.is_enabled end
                        self:refresh()
                    end,
                },
            }
        end,
    }
end

function Settings:integrationsPage()
    return {
        title = "Integrations",
        rows = function()
            return {
                {
                    icon = "lexeme",
                    title = "Lexeme",
                    subtitle = "Add words you read to your Lexeme decks and see your reading there.",
                    value = accountLabel(),
                    page = function() return self:lexemePage() end,
                },
            }
        end,
    }
end

local function syncedLabel()
    local at = require("lexeme/sync").lastSyncedAt()
    if not at then return "Never" end
    if os.date("%Y-%m-%d", at) == os.date("%Y-%m-%d") then return "Today, " .. Status.clock(at) end
    return os.date("%b ", at) .. tonumber(os.date("%d", at))
end

local function syncSubtitle()
    local Sync = require("lexeme/sync")
    local failure = Sync.lastFailure()
    if failure then return "The last sync failed: " .. failure.detail end
    local what = Sync.sendsHighlights() and "words, highlights and reading time" or "words and reading time"
    return "Send " .. what .. " to Lexeme. This also happens on its own whenever Wi-Fi connects."
end

function Settings:syncNow()
    local Toast = require("lexeme/toast")
    local done = Toast.busy("Syncing with Lexeme…")
    UIManager:nextTick(function()
        require("lexeme/sync").run(function(_, message)
            done()
            Toast.show(message)
            self:refresh()
        end)
    end)
end

function Settings:connectLexeme()
    require("lexeme/pairing"):new{
        on_connected = function()
            self:refresh("full")
            UIManager:scheduleIn(1, function()
                require("lexeme/toast").show("Connected to Lexeme as " .. accountLabel())
                self:syncNow()
            end)
        end,
    }:show()
end

function Settings:highlightsRow()
    local Sync = require("lexeme/sync")
    return {
        title = "Sync highlights and notes",
        subtitle = "Send highlights, notes, bookmarks and book reviews to Lexeme. When off, they stay on this Kindle.",
        toggle = Sync.sendsHighlights(),
        tap = function()
            G_reader_settings:saveSetting("lexeme_sync_highlights", not Sync.sendsHighlights())
            self:refresh()
        end,
    }
end

function Settings:lexemePage()
    local Sync = require("lexeme/sync")
    return {
        title = "Lexeme",
        rows = function()
            if not Sync.isConnected() then
                return {
                    {
                        title = "Connect to Lexeme",
                        subtitle = "Link this Kindle to your Lexeme account with a code.",
                        tap = function() self:connectLexeme() end,
                        chevron = true,
                    },
                    {
                        title = "Words waiting to sync",
                        subtitle = "Words you add while reading wait here until this Kindle is connected.",
                        value = tostring(#Words.pending()),
                    },
                    self:highlightsRow(),
                }
            end
            return {
                { title = "Account", value = accountLabel() },
                {
                    title = "Deck for new words",
                    subtitle = "Words you add while reading become cards in this deck.",
                    value = G_reader_settings:readSetting("lexeme_deck_name") or "Kindle",
                    page = function() return self:decksPage() end,
                },
                {
                    title = "Sync now",
                    subtitle = syncSubtitle(),
                    value = syncedLabel(),
                    tap = function() self:syncNow() end,
                },
                {
                    title = "Words waiting to sync",
                    value = tostring(#Words.pending()),
                },
                self:highlightsRow(),
                {
                    title = "Import Kindle history",
                    subtitle = Sync.sendsHighlights()
                        and "Send the words you looked up, your highlights and the books you read in Amazon's reader."
                        or "Send the words you looked up and the books you read in Amazon's reader.",
                    tap = function() self:importHistory() end,
                    chevron = true,
                },
                {
                    title = "Disconnect",
                    subtitle = "Stop syncing this Kindle. What's already in Lexeme stays there.",
                    tap = function() self:confirmDisconnect() end,
                },
            }
        end,
    }
end

function Settings:decksPage()
    local decks = require("lexeme/study").decks()
    local current = G_reader_settings:readSetting("lexeme_deck_id")
    return {
        title = "Deck for new words",
        intro = decks and "Choose where words you add go." or "Your decks show here once the Kindle has synced.",
        rows = function()
            local rows = {
                {
                    title = "Kindle",
                    plain = true,
                    check = current == nil,
                    tap = function()
                        G_reader_settings:delSetting("lexeme_deck_id")
                        G_reader_settings:delSetting("lexeme_deck_name")
                        self:pop()
                    end,
                },
            }
            for _, deck in ipairs(decks or {}) do
                if deck.name ~= "Kindle" then
                    table.insert(rows, {
                        title = deck.name,
                        plain = true,
                        check = current == deck.id,
                        tap = function()
                            G_reader_settings:saveSetting("lexeme_deck_id", deck.id)
                            G_reader_settings:saveSetting("lexeme_deck_name", deck.name)
                            self:pop()
                        end,
                    })
                end
            end
            return rows
        end,
    }
end

function Settings:importHistory()
    local Toast = require("lexeme/toast")
    Toast.show("Reading your Kindle history…")
    UIManager:nextTick(function()
        local ok, result = pcall(require("lexeme/kindle_import").queue)
        if not ok then
            Toast.show("Couldn't read the Kindle's history.")
            return
        end
        if require("lexeme/sync").sendsHighlights() then
            Toast.show(string.format("Found %d words, %d highlights and %d books. Sending…",
                result.lookups, result.highlights, result.books))
        else
            Toast.show(string.format("Found %d words and %d books. Sending…", result.lookups, result.books))
        end
        self:syncNow()
    end)
end

function Settings:confirmDisconnect()
    require("lexeme/dialog"):new{
        title = "Disconnect from Lexeme?",
        message = "This Kindle stops sending words and reading to Lexeme. Your cards and reading history in "
            .. "Lexeme stay there.",
        ok_text = "Disconnect",
        on_ok = function()
            require("lexeme/sync").disconnect()
            self:refresh()
        end,
    }:show()
end

-- KOReader's SSH server, from whichever of the reader and the file manager is open; nil when
-- the plugin is turned off.
local function sshServer()
    for _, module in ipairs({ "apps/reader/readerui", "apps/filemanager/filemanager" }) do
        local ok, app = pcall(require, module)
        if ok and app.instance and app.instance.SSH then return app.instance.SSH end
    end
end

-- This Kindle's address on the network, or nil.
local function ipAddress()
    local ok, ifaces = pcall(function() return require("ffi/netinfo"):new():retrieve() end)
    if not ok then return nil end
    for _, iface in ipairs(ifaces or {}) do
        if iface.ipv4 and iface.wireless then return iface.ipv4 end
    end
end

-- Starts or stops the SSH server without KOReader's own pop-ups; the row shows the result.
local function toggleSsh(ssh)
    local show = UIManager.show
    UIManager.show = function() end
    local ok, err = pcall(function()
        if ssh:isRunning() then ssh:stop() else ssh:start() end
    end)
    UIManager.show = show
    if not ok then error(err) end
end

function Settings:wifiPage()
    return {
        title = wifiTitle(),
        rows = function()
            local on = NetworkMgr:isWifiOn()
            local current = on and NetworkMgr:isConnected() and NetworkMgr:getCurrentNetwork()
            local rows = {
                {
                    title = "Airplane mode",
                    subtitle = "Disable all network connections.",
                    toggle = not on,
                    tap = function()
                        if on then NetworkMgr:toggleWifiOff() else NetworkMgr:toggleWifiOn() end
                        UIManager:scheduleIn(2, function() self:refresh() end)
                    end,
                },
                {
                    title = "Turn on Wi-Fi automatically",
                    subtitle = "Connect without asking when something needs the internet, like syncing.",
                    toggle = G_reader_settings:readSetting("wifi_enable_action") == "turn_on",
                    tap = function()
                        local auto = G_reader_settings:readSetting("wifi_enable_action") ~= "turn_on"
                        G_reader_settings:saveSetting("wifi_enable_action", auto and "turn_on" or "prompt")
                        self:refresh()
                    end,
                },
                {
                    title = "Wi-Fi networks",
                    subtitle = "Manage your Wi-Fi connection.",
                    value = current and current.ssid or nil,
                    page = function() return self:networksPage() end,
                    enabled = on,
                },
            }
            if Bluetooth.available() then
                local bluetooth_on = Bluetooth.isOn()
                table.insert(rows, {
                    title = "Bluetooth",
                    subtitle = "Turn on to connect to a Bluetooth audio device.",
                    toggle = bluetooth_on,
                    tap = function()
                        Bluetooth.setOn(not bluetooth_on)
                        UIManager:scheduleIn(2, function() self:refresh() end)
                    end,
                })
                if bluetooth_on then
                    table.insert(rows, {
                        title = "Bluetooth devices",
                        subtitle = "Manage your Bluetooth devices.",
                        value = Bluetooth.connectedName() or "Not Connected",
                        page = function() return self:bluetoothPage() end,
                    })
                end
            end
            local ssh = sshServer()
            if ssh then
                local running = ssh:isRunning()
                local address = running and ipAddress()
                table.insert(rows, {
                    title = "SSH server",
                    subtitle = address
                        and ("Running at " .. address .. ", port " .. ssh.SSH_port .. ".")
                        or "Log in to this Kindle from a computer on the same network.",
                    toggle = running,
                    tap = function()
                        toggleSsh(ssh)
                        UIManager:scheduleIn(1, function() self:refresh() end)
                    end,
                })
                table.insert(rows, {
                    title = "Start SSH with KOReader",
                    subtitle = "Turn the SSH server on every time KOReader opens.",
                    toggle = G_reader_settings:isTrue("SSH_autostart"),
                    tap = function()
                        G_reader_settings:flipNilOrFalse("SSH_autostart")
                        ssh.autostart = G_reader_settings:isTrue("SSH_autostart")
                        self:refresh()
                    end,
                })
            end
            return rows
        end,
        note = (Bluetooth.available() and "You can also toggle airplane mode and Bluetooth"
            or "You can also toggle airplane mode") .. " in Quick Actions by tapping or swiping on the arrow at the "
            .. "top of your screen.",
    }
end

-- The devices paired in the Kindle's own Settings; a tap connects or disconnects one.
function Settings:bluetoothPage()
    local page = { title = "Bluetooth Devices" }
    local function read()
        page.devices = Bluetooth.paired()
        page.intro = #page.devices > 0 and "Choose a paired device to connect to your Kindle."
            or "No paired devices."
    end
    read()
    page.rows = function()
        local rows = {}
        for _, device in ipairs(page.devices) do
            table.insert(rows, {
                icon = "bluetooth",
                title = device.name,
                network = true,
                check = device.connected,
                tap = function()
                    if device.connected then
                        Bluetooth.disconnect(device.address)
                    else
                        Bluetooth.connect(device.address)
                    end
                    for _, delay in ipairs({ 3, 8 }) do
                        UIManager:scheduleIn(delay, function()
                            read()
                            self:refresh()
                        end)
                    end
                end,
            })
        end
        table.insert(rows, { title = "Refresh", plain = true, tap = function()
            read()
            self:refresh()
        end })
        return rows
    end
    page.note = "To pair a new device, exit KOReader and go to Settings, Wi-Fi and Bluetooth, Bluetooth devices."
    return page
end

function Settings:networksPage()
    local page = { title = "Wi-Fi networks", intro = "Choose a network to connect your Kindle to Wi-Fi." }
    local function scan()
        local list = NetworkMgr:getNetworkList() or {}
        table.sort(list, function(a, b)
            if a.connected ~= b.connected then return a.connected == true end
            return (a.signal_quality or 0) > (b.signal_quality or 0)
        end)
        page.networks = list
    end
    scan()
    page.rows = function()
        local rows = {}
        for _, network in ipairs(page.networks) do
            if network.ssid then
                local quality = network.signal_quality or 0
                local icon = quality > 50 and "wifi" or quality > 25 and "wifi-high" or quality > 5 and "wifi-low"
                    or "wifi-zero"
                table.insert(rows, {
                    network = network,
                    icon = quality > 25 and icon or icon .. "-gray",
                    locked = network.flags and network.flags ~= "" and network.flags ~= "NONE",
                    title = network.ssid,
                    check = network.connected,
                    tap = function() self:connect(network) end,
                })
            end
        end
        table.insert(rows, { title = "Rescan", plain = true, tap = function()
            scan()
            self:refresh()
        end })
        return rows
    end
    return page
end

function Settings:connect(network)
    if network.connected then return end
    if network.password or not network.flags or network.flags == "NONE" then
        NetworkMgr:authenticateNetwork(network)
        UIManager:scheduleIn(4, function() self:refresh() end)
        return
    end
    require("lexeme/textentry").show{
        title = "Password for " .. network.ssid,
        secret = true,
        on_done = function(password)
            NetworkMgr:saveNetwork({ ssid = network.ssid, password = password, flags = network.flags })
            NetworkMgr:authenticateNetwork({ ssid = network.ssid })
            UIManager:scheduleIn(4, function() self:refresh() end)
        end,
    }
end

-- Closes the open book and the file browser so they save, as KOReader's own Exit does.
local function closeApps(after)
    local ReaderUI = require("apps/reader/readerui")
    local FileManager = require("apps/filemanager/filemanager")
    if ReaderUI.instance then ReaderUI.instance:onClose() end
    if FileManager.instance then FileManager.instance:onClose() end
    if after then after() end
end

local function freeSpace(path)
    local info = util.diskUsage and util.diskUsage(path)
    if info and info.available then return util.getFriendlySize(info.available) .. " free" end
end

local SLEEP_CHOICES = {
    { seconds = 5 * 60, label = "5 minutes" },
    { seconds = 10 * 60, label = "10 minutes" },
    { seconds = 15 * 60, label = "15 minutes" },
    { seconds = 30 * 60, label = "30 minutes" },
    { seconds = 60 * 60, label = "1 hour" },
}

-- While KOReader runs, its auto-suspend timer decides when the Kindle sleeps:
-- it keeps resetting the system's own timer until its own runs out.
local function sleepSeconds()
    return G_reader_settings:readSetting("auto_suspend_timeout_seconds") or 15 * 60
end

local function setSleepSeconds(seconds)
    G_reader_settings:saveSetting("auto_suspend_timeout_seconds", seconds)
    local autosuspend = require("pluginloader"):getPluginInstance("autosuspend")
    if not autosuspend then return end
    autosuspend.auto_suspend_timeout_seconds = seconds
    autosuspend:_unschedule()
    autosuspend:_start()
    autosuspend:_start_kindle()
end

local function sleepLabel()
    for _, choice in ipairs(SLEEP_CHOICES) do
        if choice.seconds == sleepSeconds() then return choice.label end
    end
    return math.floor(sleepSeconds() / 60) .. " minutes"
end

function Settings:sleepPage()
    return {
        title = "Sleep timer",
        intro = "Set how long your Kindle should wait before turning off the screen.",
        rows = function()
            local rows = {}
            for _, choice in ipairs(SLEEP_CHOICES) do
                table.insert(rows, {
                    title = choice.label,
                    plain = true,
                    check = choice.seconds == sleepSeconds(),
                    tap = function()
                        setSleepSeconds(choice.seconds)
                        self:refresh()
                    end,
                })
            end
            return rows
        end,
    }
end

function Settings:devicePage()
    return {
        title = "Device options",
        rows = function()
            return {
                { title = "Device info", subtitle = "View information about your Kindle.",
                    page = function() return self:deviceInfoPage() end },
                {
                    title = "Sleep timer",
                    subtitle = "Set how long your Kindle should wait before turning off the screen.",
                    value = sleepLabel(),
                    page = function() return self:sleepPage() end,
                },
                {
                    title = "24-hour clock",
                    subtitle = "Show the time as 15:30 instead of 3:30 PM.",
                    toggle = G_reader_settings:isFalse("lexeme_twelve_hour_clock"),
                    tap = function()
                        local twelve = G_reader_settings:isFalse("lexeme_twelve_hour_clock")
                        G_reader_settings:saveSetting("lexeme_twelve_hour_clock", twelve)
                        G_reader_settings:saveSetting("twelve_hour_clock", twelve)
                        self:refresh()
                    end,
                },
                {
                    title = "Restart KOReader",
                    subtitle = "Close and reopen KOReader.",
                    tap = function()
                        self:close()
                        closeApps(function() UIManager:restartKOReader() end)
                    end,
                },
                {
                    title = "Exit KOReader",
                    subtitle = "Return to the Kindle's own home screen.",
                    tap = function()
                        self:close()
                        closeApps()
                    end,
                },
            }
        end,
    }
end

function Settings:deviceInfoPage()
    local version = require("version"):getCurrentRevision()
    return {
        title = "Device info",
        rows = function()
            return {
                { title = "Device", subtitle = Device.model },
                { title = "KOReader", subtitle = version },
                { title = "Storage", subtitle = freeSpace("/mnt/us") or "Unknown" },
                { title = "Battery", subtitle = Device:getPowerDevice():getCapacity() .. "%" },
            }
        end,
    }
end

function Settings:screenPage()
    return {
        title = "Screen and brightness",
        rows = function()
            local Lockscreen = require("lexeme/lockscreen")
            local covers = Lockscreen.showsCovers()
            local dark = G_reader_settings:isTrue("night_mode")
            return {
                {
                    title = "Show covers on lock screen",
                    subtitle = "Show the cover of the book you're reading on the lock screen.",
                    toggle = covers,
                    tap = function()
                        Lockscreen.setCovers(not covers)
                        self:refresh()
                    end,
                },
                {
                    title = "Appearance",
                    subtitle = "Set your screen to light or dark mode.",
                    value = dark and "Dark mode" or "Light mode",
                    tap = function()
                        UIManager:broadcastEvent(require("ui/event"):new("ToggleNightMode"))
                        self:refresh("full")
                    end,
                },
                {
                    title = "Brightness and warmth",
                    subtitle = "Adjust your screen's brightness and warmth.",
                    page = nil,
                    tap = function() require("lexeme/quick"):new{}:show() end,
                    chevron = true,
                },
            }
        end,
        note = "You can also adjust brightness, warmth, and appearance mode in Quick Actions by tapping or swiping "
            .. "on the arrow at the top of your screen.",
    }
end

function Settings:libraryPage()
    local connected = require("lexeme/sync").isConnected()
    return {
        title = "Home and Library",
        rows = function()
            return {
                {
                    title = "Show Stats",
                    subtitle = "Show your reading time, streak, finished books and reading calendar on Home in place "
                        .. "of Recently Added. Counted on this Kindle.",
                    toggle = G_reader_settings:nilOrTrue("lexeme_home_stats"),
                    tap = function()
                        G_reader_settings:flipNilOrTrue("lexeme_home_stats")
                        self:refresh()
                    end,
                },
                connected and {
                    title = "Show Lexeme",
                    subtitle = "Show a Lexeme tab beside Home and Library for studying your decks.",
                    toggle = G_reader_settings:nilOrTrue("lexeme_study_tab"),
                    tap = function()
                        G_reader_settings:flipNilOrTrue("lexeme_study_tab")
                        self:refresh()
                    end,
                } or nil,
            }
        end,
    }
end

local function installedDictionaries()
    local dicts = {}
    local function scan(dir)
        for entry in lfs.dir(dir) do
            if entry ~= "." and entry ~= ".." then
                local path = dir .. "/" .. entry
                if lfs.attributes(path, "mode") == "directory" then
                    scan(path)
                elseif entry:match("%.ifo$") then
                    local name = entry
                    local file = io.open(path, "r")
                    if file then
                        for line in file:lines() do
                            name = line:match("^bookname=(.+)$") or name
                        end
                        file:close()
                    end
                    table.insert(dicts, { file = path, name = name })
                end
            end
        end
    end
    local dir = G_reader_settings:readSetting("dicts_dir") or (DataStorage:getDataDir() .. "/dict")
    if lfs.attributes(dir, "mode") == "directory" then scan(dir) end
    table.sort(dicts, function(a, b) return a.name < b.name end)
    return dicts
end

function Settings:dictionariesPage()
    return {
        title = "Dictionaries",
        rows = function()
            local disabled = G_reader_settings:readSetting("dicts_disabled") or {}
            local rows = {
                {
                    title = "Show Add to Lexeme",
                    subtitle = "Show Add to Lexeme in the selection toolbar and under each definition. "
                        .. "It's always in the toolbar's menu.",
                    toggle = G_reader_settings:isTrue("lexeme_dictionary_add_button"),
                    tap = function()
                        G_reader_settings:flipNilOrFalse("lexeme_dictionary_add_button")
                        self:refresh()
                    end,
                },
            }
            for _, dict in ipairs(installedDictionaries()) do
                table.insert(rows, {
                    title = dict.name,
                    toggle = not disabled[dict.file],
                    tap = function()
                        disabled[dict.file] = not disabled[dict.file] or nil
                        G_reader_settings:saveSetting("dicts_disabled", disabled)
                        self:refresh()
                    end,
                })
            end
            return rows
        end,
        note = "Dictionaries are StarDict files in koreader/data/dict. Changes apply to the next book you open.",
    }
end

-- Painting -----------------------------------------------------------------------

function Settings:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w)
    local page = self:current()
    local is_root = #self.stack == 1
    local title_x = x + D.s(66)
    if not is_root then
        D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
        self:pressable(x, y + D.s(100), D.s(120), D.s(112), function() self:pop() end,
            { x = x + D.s(7), y = y + D.s(108), w = D.s(101), h = D.s(101) })
        title_x = x + D.s(139)
    end
    D.text(bb, title_x, y + D.s(168), D.face("bold", 34), page.title, D.BLACK, w - D.s(400))
    D.icon(bb, "x", x + D.s(1189), y + D.s(131), D.s(52), D.s(52))
    self:pressable(x + w - D.s(120), y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(1165), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))

    local top = y + D.s(216)
    if page.intro then
        D.text(bb, x + D.s(36), top + D.s(60), D.face("regular", 32), page.intro)
        top = top + D.s(80)
    end
    local bottom = y + h - (page.note and D.s(150) or D.s(30))
    local rows = page.rows()
    local last = self.first_row - 1
    for i = self.first_row, #rows do
        local row_h = self:rowHeight(rows[i], w, page.icons)
        if top + row_h > bottom then break end
        self:paintRow(bb, x, top, w, row_h, rows[i], page.icons)
        top = top + row_h
        last = i
    end
    self.last_row, self.row_count = last, #rows
    if self.first_row > 1 or last < #rows then
        self:paintScroll(bb, x + w, y + D.s(216), bottom, last, #rows)
    end
    if page.note then
        local note_top = y + h - D.s(120)
        D.icon(bb, "circle-help", x + D.s(46), note_top - D.s(4), D.s(44), D.s(44))
        local lines = D.wrap(D.face("regular", 28), page.note, w - D.s(200), 2)
        for i, line in ipairs(lines) do
            D.text(bb, x + D.s(130), note_top + D.s(24) + (i - 1) * D.s(38), D.face("regular", 28), line)
        end
    end
end

function Settings:rowHeight(row, w, icons)
    if icons then return D.s(138) end
    if row.plain then return D.s(126) end
    local h = D.s(112)
    if row.subtitle then
        h = h + #D.wrap(D.face("regular", 28), row.subtitle, self:textWidth(row, w, icons), 3) * D.s(37)
    end
    return h
end

-- Room for a row's title and subtitle: after its icon, a gap short of whatever sits on the right.
function Settings:textWidth(row, w, icons)
    local left = icons and D.s(131) or row.icon and D.s(142) or D.s(59)
    if row.toggle ~= nil then return w - left - D.s(140 + 84 + 30) end
    if row.check then return w - left - D.s(210 + 30) end
    local right = D.s(icons and 89 or 140) + D.s(50)
    if row.value then right = right + D.width(D.face("regular", 32), row.value) + D.s(30) end
    return w - left - right
end

function Settings:paintRow(bb, x, top, w, row_h, row, icons)
    local enabled = row.enabled ~= false
    local color = enabled and D.BLACK or D.gray(150)
    local tx = x + (icons and D.s(131) or row.icon and D.s(142) or D.s(59))
    if row.icon then
        local ix = icons and D.s(64) or D.s(66)
        D.icon(bb, row.icon, x + ix, top + math.floor(row_h / 2) - D.s(22), D.s(44), D.s(44))
        if row.locked then D.icon(bb, "lock", x + ix + D.s(26), top + math.floor(row_h / 2), D.s(22), D.s(22)) end
    end
    local face = (row.plain or row.network) and D.face("regular", 34) or D.face("bold", 34)
    if row.subtitle and not icons then
        D.text(bb, tx, top + D.s(62), face, row.title, color, self:textWidth(row, w, icons))
        local line_y = top + D.s(98)
        for _, line in ipairs(D.wrap(D.face("regular", 28), row.subtitle, self:textWidth(row, w, icons), 3)) do
            D.text(bb, tx, line_y, D.face("regular", 28), line, color)
            line_y = line_y + D.s(37)
        end
    else
        D.text(bb, tx, top + math.floor(row_h / 2) + D.s(12), face, row.title, color, self:textWidth(row, w, icons))
    end

    local cy = top + math.floor(row_h / 2)
    local right = x + w - D.s(icons and 89 or 140)
    if row.toggle ~= nil then
        C.toggle(bb, x + w - D.s(140), cy, row.toggle)
    elseif row.check then
        D.icon(bb, "check", x + w - D.s(210), cy - D.s(24), D.s(48), D.s(48))
    elseif row.page or row.chevron or row.value then
        if row.page or row.chevron or row.tap then
            D.icon(bb, "chevron-right", right - D.s(10), cy - D.s(22), D.s(44), D.s(44))
            right = right - D.s(30)
        end
        if row.value then D.textRight(bb, right - D.s(10), cy + D.s(12), D.face("regular", 32), row.value, color) end
    end
    D.rect(bb, x + D.s(36), top + row_h - D.s(2), w - D.s(icons and 72 or 128), D.s(2), D.gray(200))

    if not enabled then return end
    -- Toggles and choices change in place; rows that open something show they were pressed.
    local pressedRow = (row.toggle == nil and not row.check) and {
        x = x + D.s(36), y = top + D.s(7), w = w - D.s(icons and 72 or 128), h = row_h - D.s(16),
    } or nil
    if row.page then
        self:pressable(x, top, w, row_h, function() self:push(row.page()) end, pressedRow)
    elseif row.tap then
        self:pressable(x, top, w, row_h, row.tap, pressedRow)
    end
end

function Settings:paintScroll(bb, right, top, bottom, last, total)
    local up, down = self.first_row > 1, last < total
    D.icon(bb, up and "triangle-up" or "triangle-up-gray", right - D.s(62), top + D.s(30), D.s(28), D.s(18))
    D.icon(bb, down and "triangle-down" or "triangle-down-gray", right - D.s(62), bottom - D.s(30), D.s(28), D.s(18))
    self:pressable(right - D.s(100), top, D.s(100), D.s(100), function() self:scroll(-1, last) end,
        D.around(right - D.s(48), top + D.s(39), D.s(101), D.s(101)))
    self:pressable(right - D.s(100), bottom - D.s(100), D.s(100), D.s(100), function() self:scroll(1, last) end,
        D.around(right - D.s(48), bottom - D.s(21), D.s(101), D.s(101)))
end

function Settings:scroll(direction, last)
    if direction > 0 then
        self.first_row = last + 1
    else
        self.first_row = math.max(1, self.first_row - (last - self.first_row + 1))
    end
    self:refresh()
end

function Settings:onSwipe(direction)
    if direction == "east" then
        self:pop()
    elseif direction == "north" and self.last_row < self.row_count then
        self:scroll(1, self.last_row)
    elseif direction == "south" and self.first_row > 1 then
        self:scroll(-1, self.last_row)
    end
    return true
end

function Settings.show(opts)
    UIManager:show(Settings:new(opts or {}), "flashui")
end

return Settings
