-- The spinner icon, turning, drawn straight to the screen by a child process: KOReader
-- can't paint while it's busy (laying out a book, syncing), and a child process can. The frames
-- are drawn beforehand, in KOReader, so the child only copies them: drawing them in the child
-- and turning ten times a second made opening a long book two seconds slower.
local Blitbuffer = require("ffi/blitbuffer")
local Screen = require("device").screen
local UIManager = require("ui/uimanager")
local ffiutil = require("ffi/util")

local Spinner = {}

local FRAMES, FRAME_SECONDS = 12, 0.25
-- The spinner icon's ring, in its 70-unit box: centre, radii and the gap's two ends in radians.
local BOX, CENTRE, INNER, OUTER = 70, 35, 26, 35
local GAP_FROM, GAP_TO = math.atan2(-28.66, 10.43), math.atan2(-10.43, 28.66)

local spinner_pid

local function inGap(angle, turn)
    local from, to = GAP_FROM + turn, GAP_TO + turn
    local a = (angle - from) % (2 * math.pi)
    return a < (to - from) % (2 * math.pi)
end

-- The ring turned by `turn` radians, anti-aliased by sampling each pixel 3 x 3 times.
local function frame(size, turn)
    local bb = Blitbuffer.new(size, size, Blitbuffer.TYPE_BB8)
    bb:fill(Blitbuffer.COLOR_WHITE)
    local scale = BOX / size
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

-- The frames for a spinner `size` pixels wide, drawn once.
local prepared = {}

function Spinner.prepare(size)
    if prepared[size] then return prepared[size] end
    local frames = {}
    for i = 0, FRAMES - 1 do frames[i + 1] = frame(size, i * 2 * math.pi / FRAMES) end
    prepared[size] = frames
    return frames
end

local function spin(frames, x, y, size)
    local i = 0
    while true do
        Screen.bb:blitFrom(frames[i % FRAMES + 1], x, y, 0, 0, size, size)
        Screen:refreshFast(x, y, size, size)
        ffiutil.usleep(FRAME_SECONDS * 1e6)
        i = i + 1
    end
end

-- Turns the spinner already painted at (x, y) until `stop`; paint it first.
function Spinner.start(x, y, size)
    Spinner.stop()
    local frames = Spinner.prepare(size)
    spinner_pid = ffiutil.runInSubProcess(function() spin(frames, x, y, size) end) or nil
end

function Spinner.stop()
    if not spinner_pid then return end
    local pid = spinner_pid
    spinner_pid = nil
    ffiutil.terminateSubProcess(pid)
    local function reap()
        if not ffiutil.isSubProcessDone(pid) then UIManager:scheduleIn(0.1, reap) end
    end
    reap()
end

return Spinner
