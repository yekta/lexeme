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
        back = function() ui:onHome() end,
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
        if index then return show_highlight_menu(highlight, index) end
        if not highlight.selected_text then return end
        Selection.show(ui, { boxes = highlight.selected_text.sboxes })
        return true
    end
    -- Tapping a highlight selects all of it, with the toolbar acting on that highlight.
    local choose_highlight = ui.highlight.showChooseHighlightDialog
    ui.highlight.showChooseHighlightDialog = function(highlight, indices)
        local index = indices[#indices]
        local item = ui.annotation.annotations[index]
        if not (ui.rolling and item and item.pos0 and item.pos1) then return choose_highlight(highlight, indices) end
        local boxes = ui.document:getScreenBoxesFromPositions(item.pos0, item.pos1, true)
        highlight.selected_text = { text = item.text, pos0 = item.pos0, pos1 = item.pos1, sboxes = boxes }
        ui.document:getTextFromXPointers(item.pos0, item.pos1, true)
        UIManager:setDirty(ui.dialog, "ui")
        Selection.show(ui, { boxes = boxes, highlight_index = index })
        return true
    end
end

function Reader.beforeRender(ui)
    if ui.rolling then Layout.applyBeforeRender(ui) end
end

function Reader.onReaderReady(ui)
    if not ui.rolling then return end
    -- Each book also remembers this setting; turn it off for books opened before.
    ui.rolling.partial_rerendering = false
    UIManager:nextTick(function()
        if ui.document then ui.document:enablePartialRerendering(false) end
    end)
end

return Reader
