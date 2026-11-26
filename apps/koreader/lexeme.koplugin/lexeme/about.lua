-- About this book: the cover, title, author and the book's own description.
local Shell = require("lexeme/shell")
local Books = require("lexeme/books")
local D = require("lexeme/draw")
local Status = require("lexeme/status")
local View = require("lexeme/view")

local About = View:extend{
    path = nil,
}

function About:init()
    View.init(self)
    self.book = Books.forPath(self.path)
    self.description = Books.description(self.path) or "This book doesn't have a description."
end

function About:render(bb, x, y, w, h)
    Status.paint(self, bb, x, y, w)
    D.icon(bb, "arrow-left", x + D.s(30), y + D.s(131), D.s(53), D.s(53))
    self:pressable(x, y + D.s(100), D.s(120), D.s(112), function() self:close("flashui") end,
        { x = x + D.s(7), y = y + D.s(108), w = D.s(101), h = D.s(101) })
    D.text(bb, x + D.s(139), y + D.s(168), D.face("bold", 34), "About this book")
    D.rect(bb, x, y + D.s(212), w, D.s(4), D.gray(170))

    local cover_w, cover_h = D.s(287), D.s(430)
    local top = y + D.s(270)
    Shell.paintCover(self, bb, 0, 0, self.book, x + D.s(60), top, cover_w, cover_h, false)

    local tx, tw = x + D.s(400), w - D.s(460)
    local line_y = top + D.s(48)
    local title_face = D.face("bold", 40)
    for _, line in ipairs(D.wrap(title_face, self.book.title or "", tw, 4)) do
        D.text(bb, tx, line_y, title_face, line)
        line_y = line_y + D.s(54)
    end
    if self.book.authors then
        D.text(bb, tx, line_y + D.s(10), D.face("regular", 32), self.book.authors, D.gray(68), tw)
    end

    local body = D.face("regular", 32)
    local by = top + cover_h + D.s(110)
    D.text(bb, x + D.s(60), by, D.face("bold", 34), "Description")
    by = by + D.s(60)
    local max_lines = math.floor((y + h - D.s(60) - by) / D.s(46))
    local lines = {}
    for paragraph in (self.description .. "\n\n"):gmatch("(.-)\n\n") do
        for _, line in ipairs(D.wrap(body, paragraph, w - D.s(120), 100)) do table.insert(lines, line) end
        table.insert(lines, "")
    end
    for i = 1, math.min(#lines, max_lines) do
        local text = lines[i]
        if i == max_lines and #lines > max_lines then text = text .. "…" end
        D.text(bb, x + D.s(60), by + (i - 1) * D.s(46), body, text)
    end
end

function About.open(path)
    About:new{ path = path }:show("flashui")
end

return About
