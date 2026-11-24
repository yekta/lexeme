-- The Kindle's loading screen: white, with a spinner turning in the middle, while a book opens.
-- KOReader can't paint while it lays a book out, so a child process turns the spinner.
local Blitbuffer = require("ffi/blitbuffer")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local ffiutil = require("ffi/util")

local D = require("lexeme/draw")
local View = require("lexeme/view")

local Loading = View:extend{}

local SIZE, FRAMES, FRAME_SECONDS = 70, 12, 0.1
-- The spinner icon's ring, in its 70-unit box: centre, radii and the gap's two ends in radians.
local CENTRE, INNER, OUTER = 35, 26, 35
local GAP_FROM, GAP_TO = math.atan2(-28.66, 10.43), math.atan2(-10.43, 28.66)

local current, spinner_pid

local function inGap(angle, turn)
    local from, to = GAP_FROM + turn, GAP_TO + turn
    local a = (angle - from) % (2 * math.pi)
    return a < (to - from) % (2 * math.pi)
end

-- The ring turned by `turn` radians, anti-aliased by sampling each pixel 3 x 3 times.
local function frame(size, turn)
    local bb = Blitbuffer.new(size, size, Blitbuffer.TYPE_BB8)
    bb:fill(Blitbuffer.COLOR_WHITE)
    local scale = SIZE / size
    for py = 0, size - 1 do
        for px = 0, size - 1 do
            local covered = 0
            for sy = 0, 2 do
                for sx = 0, 2 do
                    local dx = (px + (sx + 0.5) / 3) * scale - CENTRE
                    local dy = (py + (sy + 0.5) / 3) * scale - CENTRE
                    local r = math.sqrt(dx * dx + dy * dy)
                    if r >= INNER and r <= OUTER and not inGap(math.atan2(dy, dx), turn) then
                        covered = covered + 1
                    end
                end
            end
            if covered > 0 then
                bb:setPixel(px, py, Blitbuffer.Color8(math.floor(255 * (1 - covered / 9) + 0.5)))
            end
        end
    end
    return bb
end

local function spin(x, y, size)
    local frames = {}
    for i = 0, FRAMES - 1 do frames[i + 1] = frame(size, i * 2 * math.pi / FRAMES) end
    local i = 0
    while true do
        Screen.bb:blitFrom(frames[i % FRAMES + 1], x, y, 0, 0, size, size)
        Screen:refreshFast(x, y, size, size)
        ffiutil.usleep(FRAME_SECONDS * 1e6)
        i = i + 1
    end
end

local function stopSpinner()
    if not spinner_pid then return end
    local pid = spinner_pid
    spinner_pid = nil
    ffiutil.terminateSubProcess(pid)
    local function reap()
        if not ffiutil.isSubProcessDone(pid) then UIManager:scheduleIn(0.1, reap) end
    end
    reap()
end

function Loading:spinnerBox()
    local size = D.s(SIZE)
    return math.floor((Screen:getWidth() - size) / 2), math.floor((Screen:getHeight() - size) / 2), size
end

function Loading:render(bb)
    local x, y, size = self:spinnerBox()
    D.icon(bb, "spinner", x, y, size, size)
end

-- Shows it now, before whatever blocks next; closes itself if nothing does within `timeout` seconds.
function Loading.show(timeout)
    Loading.close()
    current = Loading:new{}
    UIManager:show(current, "flashui")
    UIManager:forceRePaint()
    local x, y, size = current:spinnerBox()
    spinner_pid = ffiutil.runInSubProcess(function() spin(x, y, size) end) or nil
    local shown = current
    UIManager:scheduleIn(timeout or 20, function()
        if current == shown then Loading.close() end
    end)
end

function Loading.close()
    stopSpinner()
    if not current then return end
    UIManager:close(current)
    current = nil
end

return Loading
