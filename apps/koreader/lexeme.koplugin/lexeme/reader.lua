-- Puts the Kindle reading chrome on KOReader's reader.
local UIManager = require("ui/uimanager")

local Footer = require("lexeme/footer")
local Layout = require("lexeme/layout")
local Quick = require("lexeme/quick")
local Selection = require("lexeme/selection")
local Toolbar = require("lexeme/toolbar")

local Reader = {}

local function actions(ui)
    return {
        library = function()
            G_reader_settings:saveSetting("lexeme_tab", "library")
            ui:onHome()
        end,
        aa = function() require("lexeme/aa").show(ui) end,
        ["goto"] = function() require("lexeme/goto").show(ui) end,
        notebook = function() require("lexeme/notebook").show(ui) end,
        search = function() require("lexeme/search").showBook(ui) end,
        pages = function() require("lexeme/pagegrid").show(ui) end,
        quick = function()
            Quick:new{ open_settings = function()
                require("lexeme/settings").show()
            end }:show()
        end,
        more_items = function()
            return {
                { text = "About this book", callback = function() require("lexeme/about").show(ui.document.file) end },
                { text = "Settings", callback = function() require("lexeme/settings").show() end },
            }
        end,
    }
end

function Reader.install(ui)
    local footer = ui.view.footer
    footer:disableFooter()
    footer.reclaim_height = true
    ui:unRegisterTouchZones({ { id = "readerfooter_tap" }, { id = "readerfooter_hold" } })
    ui.view:registerViewModule("lexeme_footer", Footer:new{ ui = ui })
    -- The Kindle never marks the corner while it relays out a book.
    ui.view.flipping.paintTo = function() end

    local toolbar_actions = actions(ui)
    local function showToolbar()
        Toolbar.show(ui, toolbar_actions)
        return true
    end
    ui.menu.onTapShowMenu = showToolbar
    ui.menu.onSwipeShowMenu = function(_, ges)
        if ges.direction ~= "south" then return end
        toolbar_actions.quick()
        return true
    end
    ui.config.onTapShowConfigMenu = function() end
    ui.config.onSwipeShowConfigMenu = function() end

    ui.dictionary.showDict = function(dict, word, results, boxes, _, close_cb)
        dict:dismissLookupInfo()
        Selection.show(ui, { word = word, results = results or {}, boxes = boxes, close_cb = close_cb })
    end
    ui.dictionary.showNoResultsDialog = function(dict, word, _, _, boxes, _, close_cb)
        dict:dismissLookupInfo()
        Selection.show(ui, { word = word, results = {}, boxes = boxes, close_cb = close_cb })
    end
    local show_highlight_menu = ui.highlight.onShowHighlightMenu
    ui.highlight.onShowHighlightMenu = function(highlight, index)
        -- An existing highlight keeps KOReader's edit dialog.
        if index then return show_highlight_menu(highlight, index) end
        if not highlight.selected_text then return end
        Selection.show(ui, { boxes = highlight.selected_text.sboxes })
        return true
    end
end

function Reader.onReaderReady(ui)
    if not ui.rolling then return end
    -- A book imported from the Kindle comes with only a percentage; it's applied
    -- once the book is laid out the Kindle's way, or the relayout loses it.
    local imported = not ui.doc_settings:has("last_xpointer") and ui.doc_settings:readSetting("last_percent")
    Layout.applyAll(ui)
    if imported then
        ui.doc_settings:delSetting("last_percent")
        -- After every other ReaderReady handler, KOReader's own position restore included.
        UIManager:nextTick(function() ui.rolling:onGotoPercent(imported * 100) end)
    end
    UIManager:setDirty(ui.dialog, "full")
end

return Reader
