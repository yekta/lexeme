--[[
The reading settings the Aa panel changes, applied straight to the document so
KOReader doesn't pop a notification for each one. Values are Kindle-style
levels; the tables below turn them into KOReader settings.
]]
local Event = require("ui/event")
local FontList = require("fontlist")
local Screen = require("device").screen

local D = require("lexeme/draw")

local Layout = {}

-- The base stylesheet for every book (kindle.css in the plugin), set by main.lua.
local stylesheet

function Layout.setStylesheet(path)
    stylesheet = path
    G_reader_settings:saveSetting("copt_css", path)
end

-- `file` is the font the Aa panel draws its name in, as the Kindle does.
Layout.FONTS = {
    { label = "Amazon Ember", names = { "Amazon Ember" }, file = "Amazon-Ember-Regular.ttf" },
    { label = "Baskerville", names = { "Baskerville" }, file = "Baskerville-Regular.ttf" },
    { label = "Bookerly", names = { "Bookerly" }, file = "Bookerly-Regular.ttf" },
    { label = "Caecilia", names = { "PMN Caecilia LT" }, file = "Caecilia_LT_65_Medium.ttf" },
    { label = "Futura", names = { "Futura Medium", "Futura" }, file = "Futura-Medium.ttf" },
    {
        label = "Helvetica",
        names = { "Helvetica Neue LT 65 Kindle Medium", "Helvetica" },
        file = "Helvetica_LT_65_Medium.ttf",
    },
    { label = "OpenDyslexic", names = { "OpenDyslexic" }, file = "OpenDyslexic-Regular.otf" },
    { label = "Palatino", names = { "Palatino" }, file = "Palatino-Regular.ttf" },
}

-- Measured on a Paperwhite (1272 px wide, 300 dpi) against the Kindle's own reader.
-- Font sizes 1..14 as em in reference pixels.
Layout.SIZES = { 29, 33, 35, 39, 44, 48, 52, 58, 64, 71, 80, 92, 105, 122 }
-- Bold 0..5 as KOReader font weights (100 = one weight step).
Layout.WEIGHTS = { [0] = 0, 1.1, 2.5, 3.2, 4, 4.3 }
-- Line spacing 0..4 as the line pitch over the font size.
Layout.LINE_SPACINGS = { [0] = 1.375, 1.62, 1.852, 2.097, 2.326 }
-- Word spacing 0..4 as the space's width in percent; each level adds about 0.22 em.
Layout.WORD_SPACINGS = { [0] = 100, 206, 308, 409, 511 }
-- How far spaces shrink, in percent, before a word moves to the next line.
Layout.SPACE_CONDENSING = 85
-- Paragraph and character spacing 0..4 add this much per level, in em.
Layout.PARAGRAPH_SPACING_EM = 1
Layout.CHARACTER_SPACING_EM = 0.056
Layout.SPACING_LEVELS = 4
-- Horizontal page margins, in reference pixels.
Layout.MARGINS = { 82, 164, 246 }
-- The text box's top and bottom: the first baseline lands at 106 px and 27 lines fit, as on the Kindle.
Layout.TOP_MARGIN = 66
Layout.BOTTOM_MARGIN = 70
-- Autohinting is what goes through the Kindle's FreeType (installed by deploy.sh) the way
-- Amazon's reader uses it; gamma 15 leaves its glyphs untouched.
local FONT_HINTING, FONT_GAMMA = 2, 15
-- crengine won't draw a font bigger than this, so bigger sizes are scaled up in CSS.
local MAX_ENGINE_SIZE = 72

local DEFAULTS = {
    lexeme_font = "Bookerly",
    lexeme_size = 3,
    lexeme_bold = 0,
    lexeme_line_spacing = 1,
    lexeme_paragraph_spacing = 0,
    lexeme_word_spacing = 0,
    lexeme_character_spacing = 0,
    lexeme_margins = 1,
    lexeme_align = "justify",
}

function Layout.get(key)
    local value = G_reader_settings:readSetting(key)
    if value == nil then return DEFAULTS[key] end
    return value
end

local function set(key, value)
    G_reader_settings:saveSetting(key, value)
end

local function updatePos(ui)
    ui:handleEvent(Event:new("UpdatePos"))
end

function Layout.availableFonts()
    local installed = {}
    for _, info in pairs(FontList.fontinfo) do
        if info[1] and info[1].name then installed[info[1].name] = true end
    end
    local fonts = {}
    for _, font in ipairs(Layout.FONTS) do
        for _, name in ipairs(font.names) do
            if installed[name] then
                table.insert(fonts, { label = font.label, name = name, file = font.file })
                break
            end
        end
    end
    return fonts
end

-- The font being read in, or just its name when it isn't one of the Kindle's.
function Layout.currentFont(ui)
    local current = ui.font.font_face
    for _, font in ipairs(Layout.availableFonts()) do
        if font.name == current then return font end
    end
    return { label = current or "", name = current }
end

function Layout.setFont(ui, name)
    ui.font:onSetFont(name)
    set("lexeme_font", name)
    G_reader_settings:saveSetting("cre_font", name)
end

-- The font size crengine gets and the CSS multiple that brings it to the Kindle's size.
local function engineSize()
    local px = D.s(Layout.SIZES[Layout.get("lexeme_size")])
    local scale = math.ceil(px / MAX_ENGINE_SIZE)
    return math.floor(px / scale + 0.5), scale, px
end

function Layout.css(ui)
    local _, scale, px = engineSize()
    return require("lexeme/typography").css{
        size_px = px,
        scale = scale,
        line_height = Layout.LINE_SPACINGS[Layout.get("lexeme_line_spacing")],
        paragraph_em = Layout.get("lexeme_paragraph_spacing") * Layout.PARAGRAPH_SPACING_EM,
        letter_em = Layout.get("lexeme_character_spacing") * Layout.CHARACTER_SPACING_EM,
        document = ui.document,
    }
end

local function applyCss(ui)
    ui:handleEvent(Event:new("ApplyStyleSheet"))
end

-- KOReader keeps sizes in its own units and scales them up when it reapplies them.
local function toKoreaderUnits(px)
    return (px - 0.5) / (Screen:scaleBySize(10000) / 10000)
end

local function applySize(ui)
    local size = engineSize()
    ui.document.configurable.font_size = toKoreaderUnits(size)
    G_reader_settings:saveSetting("copt_font_size", ui.document.configurable.font_size)
    ui.document:setFontSize(size)
end

function Layout.setSize(ui, level)
    set("lexeme_size", level)
    applySize(ui)
    applyCss(ui)
end

local function applyBold(ui)
    local weight = Layout.WEIGHTS[Layout.get("lexeme_bold")]
    ui.document.configurable.font_base_weight = weight
    ui.document:setFontBaseWeight(weight)
    G_reader_settings:saveSetting("copt_font_base_weight", weight)
end

function Layout.setBold(ui, level)
    set("lexeme_bold", level)
    applyBold(ui)
    updatePos(ui)
end

function Layout.setLineSpacing(ui, level)
    set("lexeme_line_spacing", level)
    applyCss(ui)
end

function Layout.setParagraphSpacing(ui, level)
    set("lexeme_paragraph_spacing", level)
    applyCss(ui)
end

function Layout.setCharacterSpacing(ui, level)
    set("lexeme_character_spacing", level)
    applyCss(ui)
end

local function applyWordSpacing(ui)
    local values = { Layout.WORD_SPACINGS[Layout.get("lexeme_word_spacing")], Layout.SPACE_CONDENSING }
    ui.document.configurable.word_spacing = values
    ui.document:setWordSpacing(values)
    G_reader_settings:saveSetting("copt_word_spacing", values)
end

function Layout.setWordSpacing(ui, level)
    set("lexeme_word_spacing", level)
    applyWordSpacing(ui)
    updatePos(ui)
end

function Layout.resetSpacing(ui)
    set("lexeme_line_spacing", DEFAULTS.lexeme_line_spacing)
    set("lexeme_paragraph_spacing", 0)
    set("lexeme_word_spacing", 0)
    set("lexeme_character_spacing", 0)
    applyWordSpacing(ui)
    applyCss(ui)
end

function Layout.applyMargins(ui)
    local side = D.s(Layout.MARGINS[Layout.get("lexeme_margins")])
    local top, bottom = D.s(Layout.TOP_MARGIN), D.s(Layout.BOTTOM_MARGIN)
    -- KOReader keeps margins in its own units and scales them up when it reapplies them.
    local factor = Screen:scaleBySize(10000) / 10000
    local config = ui.document.configurable
    config.h_page_margins = { side / factor, side / factor }
    config.t_page_margin = top / factor
    config.b_page_margin = bottom / factor
    G_reader_settings:saveSetting("copt_h_page_margins", config.h_page_margins)
    G_reader_settings:saveSetting("copt_t_page_margin", config.t_page_margin)
    G_reader_settings:saveSetting("copt_b_page_margin", config.b_page_margin)
    ui.document:setPageMargins(side, top, side, bottom)
end

function Layout.setMargins(ui, level)
    set("lexeme_margins", level)
    Layout.applyMargins(ui)
    updatePos(ui)
end

function Layout.setAlign(ui, align)
    local left = ui.styletweak.doc_tweaks and ui.styletweak.doc_tweaks.text_align_all_left
    local global_left = ui.styletweak.global_tweaks and ui.styletweak.global_tweaks.text_align_all_left
    if (align == "left") ~= (left or global_left or false) then
        ui.styletweak:onToggleStyleTweak("text_align_all_left", nil, true)
    end
    set("lexeme_align", align)
end

function Layout.isLandscape()
    return Screen:getWidth() > Screen:getHeight()
end

function Layout.setLandscape(ui, landscape)
    if Layout.isLandscape() == landscape then return end
    local mode = landscape and Screen.DEVICE_ROTATED_CLOCKWISE or Screen.DEVICE_ROTATED_UPRIGHT
    ui:handleEvent(Event:new("SetRotationMode", mode))
end

-- Reading settings follow the reader, not the book, as on a Kindle: a book
-- opened with other settings is brought in line with the current ones.
-- Our stylesheet rides along with KOReader's style tweaks, so every relayout includes it.
local function installCss(ui)
    if ui.styletweak.lexeme_css then return end
    local original = ui.styletweak.getCssText
    ui.styletweak.getCssText = function(tweaks)
        local css = original(tweaks)
        local ours = Layout.css(ui)
        return css and css ~= "" and css .. "\n" .. ours or ours
    end
    ui.styletweak.lexeme_css = true
end

-- Runs before the first layout: laying the book out twice shifts the saved position.
function Layout.applyBeforeRender(ui)
    local document = ui.document
    installCss(ui)
    document._document:setIntProperty("crengine.style.floating.punctuation.enabled", 0)
    if stylesheet then ui.typeset.css = stylesheet end
    document:setStyleSheet(ui.typeset.css, ui.styletweak:getCssText())
    local font = Layout.get("lexeme_font")
    ui.font.font_face = font
    document:setFontFace(font)
    document.configurable.embedded_fonts = 0
    document:setEmbeddedFonts(0)
    G_reader_settings:saveSetting("copt_embedded_fonts", 0)
    applySize(ui)
    applyBold(ui)
    document.configurable.line_spacing = 100
    document:setInterlineSpacePercent(100)
    G_reader_settings:saveSetting("copt_line_spacing", 100)
    applyWordSpacing(ui)
    Layout.applyMargins(ui)
    -- Edges as sharp as the Kindle's at its weight: native hinting, contrast a step under 1.45.
    document.configurable.font_hinting = FONT_HINTING
    document:setFontHinting(FONT_HINTING)
    document.configurable.font_gamma = FONT_GAMMA
    document:setGammaIndex(FONT_GAMMA)
end

-- Kindle's built-in themes. A theme with a font or boldness only matches when those match too.
Layout.THEMES = {
    { key = "compact", label = "Compact", size = 2, line_spacing = 0, margins = 1 },
    { key = "standard", label = "Standard", size = 3, line_spacing = 1, margins = 1 },
    { key = "large", label = "Large", size = 6, line_spacing = 2, margins = 2 },
    { key = "low_vision", label = "Low vision", size = 10, line_spacing = 2, margins = 2, bold = 2 },
}

local HIDDEN_BY_DEFAULT = { low_vision = true }

function Layout.savedThemes()
    return G_reader_settings:readSetting("lexeme_saved_themes") or {}
end

local function setSavedThemes(themes)
    G_reader_settings:saveSetting("lexeme_saved_themes", themes)
end

-- Every theme, saved ones first, each with a stable `key`.
function Layout.allThemes()
    local themes = {}
    for i, theme in ipairs(Layout.savedThemes()) do
        local copy = { key = "saved:" .. theme.label, label = theme.label, saved = i }
        for k, v in pairs(theme) do if copy[k] == nil then copy[k] = v end end
        table.insert(themes, copy)
    end
    for _, theme in ipairs(Layout.THEMES) do table.insert(themes, theme) end
    return themes
end

function Layout.isHidden(theme)
    local hidden = G_reader_settings:readSetting("lexeme_hidden_themes") or {}
    if hidden[theme.key] ~= nil then return hidden[theme.key] end
    return HIDDEN_BY_DEFAULT[theme.key] == true
end

function Layout.setHidden(theme, hidden)
    local all = G_reader_settings:readSetting("lexeme_hidden_themes") or {}
    all[theme.key] = hidden
    G_reader_settings:saveSetting("lexeme_hidden_themes", all)
end

local function matches(theme)
    return Layout.get("lexeme_size") == theme.size and Layout.get("lexeme_line_spacing") == theme.line_spacing
        and Layout.get("lexeme_margins") == theme.margins
        and (theme.font == nil or theme.font == Layout.get("lexeme_font"))
        and (theme.bold == nil or theme.bold == Layout.get("lexeme_bold"))
end

-- The theme the current settings match, or nil for custom settings.
function Layout.currentTheme()
    for _, theme in ipairs(Layout.allThemes()) do
        if matches(theme) then return theme end
    end
end

function Layout.applyTheme(ui, theme)
    if theme.font then Layout.setFont(ui, theme.font) end
    Layout.setBold(ui, theme.bold or 0)
    Layout.setSize(ui, theme.size)
    Layout.setLineSpacing(ui, theme.line_spacing)
    Layout.setMargins(ui, theme.margins)
end

function Layout.saveTheme(label)
    local themes = Layout.savedThemes()
    table.insert(themes, 1, {
        label = label,
        font = Layout.get("lexeme_font"),
        bold = Layout.get("lexeme_bold"),
        size = Layout.get("lexeme_size"),
        line_spacing = Layout.get("lexeme_line_spacing"),
        margins = Layout.get("lexeme_margins"),
    })
    setSavedThemes(themes)
end

function Layout.renameTheme(index, label)
    local themes = Layout.savedThemes()
    themes[index].label = label
    setSavedThemes(themes)
end

function Layout.deleteTheme(index)
    local themes = Layout.savedThemes()
    table.remove(themes, index)
    setSavedThemes(themes)
end

return Layout
