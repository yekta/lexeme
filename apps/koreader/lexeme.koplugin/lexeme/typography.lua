--[[
The stylesheet that makes KOReader set a page the way the Kindle does. crengine
floors lengths where the Kindle rounds, so line heights get half a pixel added.
Books converted from KFX keep vertical margins in line heights, which KFX Input
writes as em × 1.2; they're scaled back so they follow the line spacing.

It's set before the book loads as well as after: crengine styles every element as it loads, and
a stylesheet that changes once it has loaded makes it style them all again (a quarter of the time
a first opening takes, and twice the memory). Before loading, the engine can't read the book's
files, so its stylesheets are read from the EPUB itself; after, the engine's copy decides.
]]
local Typography = {}

local KFX_LINE_HEIGHT_EM = 1.2

local function em(value)
    if value == "0" then return 0 end
    local number = value:match("^(-?[%d.]+)em$")
    return number and tonumber(number)
end

local function declarations(block)
    local result = {}
    for prop, value in block:gmatch("([%w-]+)%s*:%s*([^;]+)") do
        result[prop] = value:gsub("%s*!important", ""):match("^%s*(.-)%s*$")
    end
    return result
end

local function verticalMargins(decls)
    local top, bottom
    if decls.margin then
        local parts = {}
        for part in decls.margin:gmatch("%S+") do table.insert(parts, part) end
        top, bottom = em(parts[1]), em(parts[3] or parts[1])
    end
    if decls["margin-top"] then top = em(decls["margin-top"]) end
    if decls["margin-bottom"] then bottom = em(decls["margin-bottom"]) end
    return top, bottom
end

local function rules(css)
    local result = {}
    css = css:gsub("/%*.-%*/", "")
    for selector, block in css:gmatch("([^{}@]+){([^{}]*)}") do
        selector = selector:match("^%s*(.-)%s*$")
        if selector ~= "" then table.insert(result, { selector = selector, decls = declarations(block) }) end
    end
    return result
end

-- The OPF's stylesheets. Found by their media type rather than by going through every item: a
-- long book lists thousands (Woolf's complete works took half a second at each open).
local function cssHrefs(opf)
    local hrefs, from = {}, 1
    while true do
        local at = opf:find('media-type="text/css"', from, true)
        if not at then return hrefs end
        local open = at
        while open > 1 and opf:byte(open) ~= 60 do open = open - 1 end -- back to its "<"
        local close = opf:find(">", at, true) or #opf
        local item = opf:sub(open, close)
        local href = item:find("^<item%s") and item:match('href="([^"]+)"')
        if href then table.insert(hrefs, href) end
        from = close + 1
    end
end

-- The book's own stylesheets, as listed in its OPF.
local function bookCss(document)
    if not document.getDocumentFileContent then return "" end
    local container = document:getDocumentFileContent("META-INF/container.xml")
    local opf_path = container and container:match('full%-path="([^"]+)"')
    local opf = opf_path and document:getDocumentFileContent(opf_path)
    if not opf then return "" end
    local base = opf_path:match("^(.*/)") or ""
    local parts = {}
    for _, href in ipairs(cssHrefs(opf)) do
        local css = document:getDocumentFileContent(base .. href)
        if css then table.insert(parts, css) end
    end
    return table.concat(parts, "\n")
end

-- The book's container.xml, OPF and stylesheets read from the EPUB file, as a document whose
-- getDocumentFileContent serves them; nil when it isn't an EPUB or can't be read.
local function epubFiles(path)
    if not (path and path:lower():match("%.epub$")) then return nil end
    local ok, Archiver = pcall(require, "ffi/archiver")
    if not ok then return nil end
    local reader = Archiver.Reader:new()
    if not reader:open(path) then return nil end
    local files = {}
    for entry in reader:iterate() do
        local name = entry.path
        if name == "META-INF/container.xml" or name:match("%.[Oo][Pp][Ff]$") or name:match("%.[Cc][Ss][Ss]$") then
            files[name] = reader:extractToMemory(name)
        end
    end
    reader:close()
    local function decoded(name)
        return (name:gsub("%%(%x%x)", function(hex) return string.char(tonumber(hex, 16)) end))
    end
    return { getDocumentFileContent = function(_, name) return files[name] or files[decoded(name)] end }
end

-- Parsed rules by document: "early" from the file before the engine has loaded it, "loaded" after.
local cache = setmetatable({}, { __mode = "k" })

local function bookRules(document)
    -- Only KOReader's documents say whether they're loaded; anything else can read its files.
    local loaded = document._loaded ~= false
    local kept = cache[document] or {}
    cache[document] = kept
    local key = loaded and "loaded" or "early"
    if kept[key] then return kept[key] end
    local source = document
    if not loaded then source = epubFiles(document.file) end
    local ok, css = false, ""
    if source then ok, css = pcall(bookCss, source) end
    css = ok and css or ""
    kept[key] = { rules = rules(css), kfx = css:find("%.class_s%w+%s*{") ~= nil }
    return kept[key]
end

local function number(n)
    return (string.format("%.4f", n):gsub("0+$", ""):gsub("%.$", ""))
end

-- The reader's font replaces the book's, as on a Kindle with Publisher Font off; code stays monospace.
local FONT_FAMILY_CSS = [[
body, body * { font-family: inherit !important; }
listing, plaintext, xmp, samp, tt, kbd, pre, code { font-family: monospace !important; }]]

--[[
`opts`: size_px (the body font size), scale (font-size multiple on body, for
sizes past crengine's limit), line_height (pitch as a multiple of the font
size), paragraph_em and letter_em (extra space), document.
]]
function Typography.css(opts)
    local out = { FONT_FAMILY_CSS }
    if opts.scale and opts.scale ~= 1 then
        table.insert(out, string.format("body { font-size: %sem !important; }", number(opts.scale)))
    end
    local line_height = opts.line_height + 0.5 / opts.size_px
    table.insert(out, string.format("body, body * { line-height: %sem !important; }", number(line_height)))
    if opts.letter_em > 0 then
        table.insert(out, string.format("body, body * { letter-spacing: %sem !important; }", number(opts.letter_em)))
    end
    local book = opts.document and bookRules(opts.document) or { rules = {} }
    for _, rule in ipairs(book.rules) do
        -- A line height the book sets itself (drop caps, display type) still wins.
        if rule.decls["line-height"] then
            table.insert(out, string.format("%s { line-height: %s !important; }", rule.selector,
                rule.decls["line-height"]))
        end
    end
    if book.kfx then
        local per_em = opts.line_height / KFX_LINE_HEIGHT_EM
        for _, rule in ipairs(book.rules) do
            local top, bottom = verticalMargins(rule.decls)
            if top or bottom then
                local decls = {}
                if top then
                    local extra = rule.selector:find("^%.class_s") and opts.paragraph_em or 0
                    table.insert(decls, string.format("margin-top: %sem !important;", number(top * per_em + extra)))
                end
                if bottom then
                    table.insert(decls, string.format("margin-bottom: %sem !important;", number(bottom * per_em)))
                end
                table.insert(out, rule.selector .. " { " .. table.concat(decls, " ") .. " }")
            end
        end
    elseif opts.paragraph_em > 0 then
        table.insert(out, string.format("p { margin-top: %sem !important; }", number(opts.paragraph_em)))
    end
    return table.concat(out, "\n")
end

return Typography
