-- Page overview: the book's pages as a 3 x 3 grid of thumbnails.
local UIManager = require("ui/uimanager")

local C = require("lexeme/controls")
local D = require("lexeme/draw")
local Progress = require("lexeme/progress")
local View = require("lexeme/view")

local PageGrid = View:extend{
    ui = nil,
}

local COLS, ROWS = 3, 3
local CELL_X = { 128, 479, 836 }
local CELL_Y = { 44, 521, 998 }
local CELL_W, CELL_H = 344, 465

function PageGrid:init()
    View.init(self)
    self.current = Progress.page(self.ui)
    self.count = Progress.pageCount(self.ui)
    self.first = math.floor((self.current - 1) / (COLS * ROWS)) * COLS * ROWS + 1
    self.batch = 0
    self.tiles = {}
end

function PageGrid:requestTiles()
    self.batch = self.batch + 1
    local batch = self.batch
    for i = 0, COLS * ROWS - 1 do
        local page = self.first + i
        if page > self.count then break end
        if not self.tiles[page] then
            self.ui.thumbnail:getPageThumbnail(page, D.s(CELL_W), D.s(CELL_H), batch, function(tile, b, async)
                if b ~= self.batch or not tile then return end
                self.tiles[page] = tile.bb
                if async then self:refresh("fast") end
            end)
        end
    end
end

function PageGrid:render(bb, x, y, w, h)
    self:requestTiles()
    for i = 0, COLS * ROWS - 1 do
        local page = self.first + i
        if page > self.count then break end
        local col, row = i % COLS, math.floor(i / COLS)
        local cx, cy = x + D.s(CELL_X[col + 1]), y + D.s(CELL_Y[row + 1])
        local tile = self.tiles[page]
        if tile then
            local tw, th = math.min(tile:getWidth(), D.s(CELL_W)), math.min(tile:getHeight(), D.s(CELL_H))
            bb:blitFrom(tile, cx, cy, 0, 0, tw, th)
        end
        local current = page == self.current
        D.border(bb, cx, cy, D.s(CELL_W), D.s(CELL_H), D.s(current and 5 or 2))
        local label = tostring(page)
        local face = D.face("bold", 28)
        local tw = D.width(face, label) + D.s(20)
        D.rect(bb, cx, cy, tw, D.s(46))
        D.text(bb, cx + D.s(10), cy + D.s(34), face, label, D.WHITE)
        self:hit(cx, cy, D.s(CELL_W), D.s(CELL_H), function()
            self:close("flashui")
            Progress.goToPage(self.ui, page)
        end)
    end

    D.icon(bb, "x", x + w - D.s(90), y + D.s(40), D.s(56), D.s(56))
    self:pressable(x + w - D.s(120), y, D.s(120), D.s(120), function() self:close("flashui") end,
        { x = x + w - D.s(86), y = y + D.s(43), w = D.s(51), h = D.s(51), radius = D.s(5) })
    local mid = y + D.s(CELL_Y[2] + CELL_H / 2)
    local can_back, can_forward = self.first > 1, self.first + COLS * ROWS <= self.count
    D.icon(bb, can_back and "chevron-left" or "chevron-left-gray", x + D.s(22), mid - D.s(40), D.s(80), D.s(80))
    D.icon(bb, can_forward and "chevron-right" or "chevron-right-gray", x + w - D.s(102), mid - D.s(40), D.s(80),
        D.s(80))
    local function chevron(cx) return D.around(cx, mid, D.s(57), D.s(56), { radius = D.s(10) }) end
    self:pressable(x, y + D.s(120), D.s(120), D.s(1350), function() self:turn(-1) end, chevron(x + D.s(59)))
    self:pressable(x + w - D.s(120), y + D.s(120), D.s(120), D.s(1350), function() self:turn(1) end,
        chevron(x + w - D.s(61)))

    local bottom = y + h - D.s(1696 - 1500)
    D.rect(bb, x, bottom, w, D.s(4))
    local chapter = self.ui.toc:getTocTitleByPage(self.first) or ""
    D.textCenter(bb, x + w / 2, bottom + D.s(66), D.face("regular", 36), chapter, D.BLACK, w - D.s(260))
    C.slider(self, bb, {
        x0 = x + D.s(186), x1 = x + D.s(1086), cy = bottom + D.s(140),
        min = 1, max = self.count, value = self.first, continuous = true,
        knob = D.s(60), thick = D.s(12), thin = D.s(3),
        on_change = function(value)
            local page = math.max(1, math.min(self.count, math.floor(value + 0.5)))
            self.first = math.floor((page - 1) / (COLS * ROWS)) * COLS * ROWS + 1
            self:refresh()
        end,
    })
end

function PageGrid:turn(delta)
    local first = self.first + delta * COLS * ROWS
    if first < 1 or first > self.count then return end
    self.first = first
    self:refresh()
end

function PageGrid:onSwipe(direction)
    if direction == "west" or direction == "north" then self:turn(1)
    elseif direction == "east" or direction == "south" then self:turn(-1) end
    return true
end

function PageGrid:onCloseWidget()
    self.batch = self.batch + 1
    self.ui.thumbnail:cancelPageThumbnailRequests()
end

function PageGrid.show(ui)
    UIManager:show(PageGrid:new{ ui = ui }, "flashui")
end

return PageGrid
