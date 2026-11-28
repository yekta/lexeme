-- Puts the Kindle reading chrome on KOReader's reader.
local UIManager = require("ui/uimanager")
local util = require("util")
local lfs = require("libs/libkoreader-lfs")

local Footer = require("lexeme/footer")
local HighlightPositions = require("lexeme/highlight_positions")
local Layout = require("lexeme/layout")
local Marks = require("lexeme/marks")
local Notes = require("lexeme/notes")
local Quick = require("lexeme/quick")
local Reading = require("lexeme/reading")
local Selection = require("lexeme/selection")
local Toolbar = require("lexeme/toolbar")
local Vocabulary = require("lexeme/vocabulary")
local Zones = require("lexeme/zones")

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
                { text = "Vocabulary Builder", callback = function() require("lexeme/vocabulary_screen").show(ui) end },
                { text = "About this book", callback = function() require("lexeme/about").open(ui.document.file) end },
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

    -- Selections and highlights look like the Kindle's: no fill on selected text, marks
    -- around it instead, and highlights in the Kindle's grey.
    ui.view:registerViewModule("lexeme_marks", Marks:new{ ui = ui })
    ui.view.drawTempHighlight = function() end
    ui.view.highlight.lighten_factor = 71 / 255
    local draw_highlight_rect = ui.view.drawHighlightRect
    -- crengine's word boxes reach a pixel past the Kindle's on either side.
    ui.view.drawHighlightRect = function(view, bb, x, y, rect, drawer, color, draw_note_mark)
        if drawer == "lighten" then color = nil end
        rect = { x = rect.x + 1, y = rect.y, w = math.max(1, rect.w - 2), h = rect.h }
        return draw_highlight_rect(view, bb, x, y, rect, drawer, color, draw_note_mark)
    end
    HighlightPositions.install(ui)
    if ui.rolling then
        local get_text = ui.document.getTextFromPositions
        ui.document.getTextFromPositions = function(document, pos0, pos1)
            return get_text(document, pos0, pos1, true)
        end
        local get_word = ui.document.getWordFromPosition
        ui.document.getWordFromPosition = function(document, pos)
            return get_word(document, pos, true)
        end
        local get_text_xp = ui.document.getTextFromXPointers
        ui.document.getTextFromXPointers = function(document, pos0, pos1)
            return get_text_xp(document, pos0, pos1, false)
        end
    end

    -- As on a Kindle: a held word is only underlined, and its handles come with the release.
    local on_hold, on_hold_release = ui.highlight.onHold, ui.highlight.onHoldRelease
    ui.highlight.onHold = function(self, arg, ges)
        self.lexeme_holding = true
        local handled = on_hold(self, arg, ges)
        -- KOReader gives a held word one box around all of it, which for a word hyphenated
        -- across two lines covers both lines whole; it gets one box per line instead.
        local selected = self.selected_text
        if ui.rolling and selected and selected.pos0 and selected.pos1 then
            local boxes = ui.document:getScreenBoxesFromPositions(selected.pos0, selected.pos1, true)
            if #boxes > 1 then selected.sboxes = boxes end
        end
        Marks.refresh(ui)
        return handled
    end
    ui.highlight.onHoldRelease = function(self)
        if self.lexeme_holding then
            self.lexeme_holding = nil
            Marks.refresh(ui)
            UIManager:forceRePaint()
        end
        return on_hold_release(self)
    end

    -- The sheet opens saying it's searching, and is the lookup's cancel target meanwhile.
    ui.dictionary.showLookupInfo = function(dict, word)
        dict.lookup_progress_msg = Selection.showSearching(ui, word)
    end
    -- Vocabulary Builder keeps the word with the sentence it was read in, once the sheet is up.
    local function record(word, results)
        local ok, sentence, pos = pcall(function()
            local before, after = ui.highlight:getSelectedWordContext(15)
            local selected = ui.highlight.selected_text
            return before and Reading.sentence(before, word, after) or nil, selected and selected.pos0
        end)
        if not ok then sentence, pos = nil, nil end
        UIManager:nextTick(function() Vocabulary.record(ui, word, results, sentence, pos) end)
    end
    local function showResults(dict, word, results, boxes, close_cb)
        record(word, results)
        local searching = dict.lookup_progress_msg
        dict.lookup_progress_msg = nil
        local opts = { word = word, results = results, boxes = boxes, close_cb = close_cb,
            highlight_index = ui.highlight.lexeme_tapped_index }
        ui.highlight.lexeme_tapped_index = nil
        if searching then return searching:found(opts) end
        Selection.show(ui, opts)
    end
    ui.dictionary.showDict = function(dict, word, results, boxes, _, close_cb)
        showResults(dict, word, results or {}, boxes, close_cb)
    end
    ui.dictionary.showNoResultsDialog = function(dict, word, _, _, boxes, _, close_cb)
        showResults(dict, word, {}, boxes, close_cb)
        return true
    end
    local show_highlight_menu = ui.highlight.onShowHighlightMenu
    ui.highlight.onShowHighlightMenu = function(highlight, index)
        if index then return show_highlight_menu(highlight, index) end
        if not highlight.selected_text then return end
        Selection.show(ui, { boxes = highlight.selected_text.sboxes })
        return true
    end
    -- Tapping a highlight selects all of it, with the toolbar acting on that highlight;
    -- a highlighted word also opens the dictionary, as on a Kindle.
    local choose_highlight = ui.highlight.showChooseHighlightDialog
    ui.highlight.showChooseHighlightDialog = function(highlight, indices)
        local index = indices[#indices]
        local item = ui.annotation.annotations[index]
        if not (ui.rolling and item and item.pos0 and item.pos1) then return choose_highlight(highlight, indices) end
        local boxes = ui.document:getScreenBoxesFromPositions(item.pos0, item.pos1, true)
        highlight.selected_text = { text = item.text, pos0 = item.pos0, pos1 = item.pos1, sboxes = boxes }
        local word = util.cleanupSelectedText(item.text)
        if word ~= "" and not word:find("%s") then
            highlight.lexeme_tapped_index = index
            UIManager:setDirty(ui.dialog, "ui")
            ui.dictionary:onLookupWord(word, false, boxes)
            return true
        end
        UIManager:setDirty(ui.dialog, "ui")
        Selection.show(ui, { boxes = boxes, highlight_index = index })
        return true
    end
    -- Footnotes in a sheet, links with a bar to go back, note numbers that can't be selected.
    Notes.install(ui)
end

-- The reading settings go in before the book loads too, after KOReader's own: crengine styles the
-- book as it loads it, and anything that differs by the time it's laid out (the stylesheet, a
-- margin a pixel off from KOReader's rounding) has it style the whole book again.
function Reader.beforeLoad(ui)
    -- crengine reads its cache once the read started as the cover was tapped is done.
    require("lexeme/engine").awaitReadAhead()
    if not ui.rolling then return end
    -- A book laid out before loads its styles with it from crengine's cache: nothing to gain, and
    -- reading the stylesheets out of the EPUB would only slow its opening down.
    local cache = ui.doc_settings:readSetting("cache_file_path")
    if cache and lfs.attributes(cache, "mode") == "file" then
        -- crengine parses the stylesheet set as the book loads, though a book read from its cache
        -- keeps its styles, and Lexeme sets the one it's laid out with before the layout: no
        -- stylesheet now saves parsing KOReader's for nothing.
        ui.document:setStyleSheet()
        return
    end
    Layout.applyBeforeRender(ui)
end

function Reader.beforeRender(ui)
    if ui.rolling then Layout.applyBeforeRender(ui) end
end

function Reader.onReaderReady(ui)
    -- KOReader's gesture shortcuts (page flipping on the top-left, the light on the
    -- bottom-left, 10-page jumps...) aren't the Kindle's; the Kindle's own are in Zones.
    if ui.gestures then ui.gestures.gestures = {} end
    -- After the reader modules' own zones, which are set up as the reader gets ready.
    Zones.install(ui)
    -- Vocabulary Builder is set up after the reader modules, so it's replaced here.
    -- It keeps every look-up, without stopping to say a word is already in it.
    local vocabulary = package.loaded["db"]
    if ui.vocabbuilder and vocabulary and vocabulary.insertOrUpdate then
        ui.vocabbuilder.onWordLookedUp = function(_, word, title)
            local prev_context, next_context = ui.highlight:getSelectedWordContext(15)
            local selected = ui.highlight.selected_text
            local text = selected and selected.text and util.cleanupSelectedText(selected.text)
            vocabulary:insertOrUpdate({
                book_title = title,
                time = os.time(),
                word = word,
                prev_context = prev_context,
                next_context = next_context,
                highlight = text ~= word and text or nil,
            })
            return true
        end
    end
    if not ui.rolling then return end
    -- Each book also remembers this setting; turn it off for books opened before.
    ui.rolling.partial_rerendering = false
    UIManager:nextTick(function()
        if ui.document then ui.document:enablePartialRerendering(false) end
    end)
    require("lexeme/locations").setup(ui)
    require("lexeme/locations").openWhereAmazonLeftOff(ui)
    -- A converted book opened for the first time takes the Kindle reader's highlights and position.
    require("lexeme/amazon_import").apply(ui)
    -- Where the book opened is its reading spot, for "Back to loc …" (lexeme/backstack.lua); after
    -- the tick on which it may move to where Amazon's reader left the book.
    UIManager:nextTick(function()
        UIManager:nextTick(function() require("lexeme/backstack").start(ui) end)
    end)
end

return Reader
