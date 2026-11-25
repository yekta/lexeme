--[[
Network work, kept off the screen's thread. Tasks run one after another in a
coroutine; each blocking call a task hands to Background.await runs in a child
process, and the screen stays responsive until its results are back.
]]
local UIManager = require("ui/uimanager")
local buffer = require("string.buffer")
local ffiutil = require("ffi/util")
local logger = require("logger")

local Background = {}

local POLL_SECONDS = 0.1

local queue = {}
local queued = {}
local current

local startNext

local function pack(...)
    return { n = select("#", ...), ... }
end

local function resume(co, ...)
    local ok, err = coroutine.resume(co, ...)
    if not ok then logger.warn("Lexeme: background task failed:", err) end
    if coroutine.status(co) ~= "dead" then return end
    current = nil
    startNext()
end

startNext = function()
    if current or #queue == 0 then return end
    local task = table.remove(queue, 1)
    current = coroutine.create(function()
        local ok, err = xpcall(task.run, debug.traceback)
        if task.key then queued[task.key] = nil end
        if not ok then logger.warn("Lexeme: background task failed:", err) end
    end)
    resume(current)
end

-- Queues `run`. With a `key`, it's skipped (false) while a task with the same key is waiting or running.
function Background.run(run, key)
    if key and queued[key] then return false end
    if key then queued[key] = true end
    table.insert(queue, { run = run, key = key })
    startNext()
    return true
end

--[[
Returns what `fn` returns, run in a child process so the screen isn't held up.
`on_poll` is called while it runs. Outside a task it just calls `fn`. Results
must be plain data: strings, numbers, booleans, tables of them.
]]
function Background.await(fn, on_poll)
    local co = coroutine.running()
    if not co or co ~= current then return fn() end
    local pid, fd = ffiutil.runInSubProcess(function(_, write_fd)
        local ok, encoded = pcall(buffer.encode, pack(pcall(fn)))
        ffiutil.writeToFD(write_fd, ok and encoded or "", true)
    end, true)
    if not pid then
        logger.warn("Lexeme: couldn't start a background process:", fd)
        return fn()
    end
    local function poll()
        if on_poll then on_poll() end
        if (ffiutil.getNonBlockingReadSize(fd) or 0) == 0 and not ffiutil.isSubProcessDone(pid) then
            return UIManager:scheduleIn(POLL_SECONDS, poll)
        end
        local data = ffiutil.readAllFromFD(fd)
        ffiutil.isSubProcessDone(pid, true)
        resume(co, data)
    end
    UIManager:scheduleIn(POLL_SECONDS, poll)
    local ok, results = pcall(buffer.decode, coroutine.yield())
    if not ok or type(results) ~= "table" then error("A background process stopped without an answer.", 0) end
    if not results[1] then error(results[2], 0) end
    return unpack(results, 2, results.n)
end

return Background
