-- Plays touch frames on the Kindle: FILE holds "<pause_us> <nbytes>\n" headers, each followed by the bytes.
local ffi = require("ffi")
ffi.cdef[[ int usleep(unsigned int usec); ]]

local f = assert(io.open(arg[1], "rb"))
local data = f:read("*a")
f:close()
local out = assert(io.open("/dev/input/event1", "wb"))
local pos = 1
while pos <= #data do
    local pause, n, after = data:match("^(%d+) (%d+)\n()", pos)
    out:write(data:sub(after, after + n - 1))
    out:flush()
    pos = after + n
    if tonumber(pause) > 0 then ffi.C.usleep(tonumber(pause)) end
end
out:close()
