-- Talks to the Lexeme server: JSON over HTTP(S), with the device's API key once paired.
local JSON = require("json")
local http = require("socket.http")
local ltn12 = require("ltn12")
local socket = require("socket")
local socketutil = require("socketutil")

local Api = {}

local DEFAULT_SERVER = "https://api.lexeme.fyi"

function Api.server()
    return (G_reader_settings:readSetting("lexeme_server") or DEFAULT_SERVER):gsub("/+$", "")
end

function Api.token()
    return G_reader_settings:readSetting("lexeme_token")
end

--[[
Returns ok, body_or_error, status. `ok` is false for a network failure (try
again later) and for a refusal; `status` tells the two apart: nil when the
server was never reached.
]]
function Api.request(method, path, body, use_token)
    local response = {}
    local headers = { ["Accept"] = "application/json" }
    local source
    if body then
        local encoded = JSON.encode(body)
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = tostring(#encoded)
        source = ltn12.source.string(encoded)
    end
    if use_token ~= false and Api.token() then
        headers["Authorization"] = "Bearer " .. Api.token()
    end
    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local code, _, status = socket.skip(1, http.request{
        url = Api.server() .. path,
        method = method,
        headers = headers,
        source = source,
        sink = ltn12.sink.table(response),
    })
    socketutil:reset_timeout()
    if type(code) ~= "number" then return false, status or code, nil end
    local text = table.concat(response)
    local ok, decoded = pcall(JSON.decode, text)
    if not ok then decoded = { raw = text } end
    if code >= 200 and code < 300 then return true, decoded, code end
    local message = type(decoded) == "table" and decoded.error and decoded.error.message
    return false, message or ("HTTP " .. code), code
end

function Api.post(path, body, use_token)
    return Api.request("POST", path, body, use_token)
end

function Api.get(path)
    return Api.request("GET", path, nil, true)
end

-- Downloads `path` into the file `dest`, calling `on_progress(received_bytes)` as it goes. Returns ok, error.
function Api.download(path, dest, on_progress)
    local file, open_err = io.open(dest, "wb")
    if not file then return false, open_err end
    local received = 0
    local function sink(chunk)
        if chunk then
            file:write(chunk)
            received = received + #chunk
            if on_progress then on_progress(received) end
        end
        return 1
    end
    socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT, socketutil.FILE_TOTAL_TIMEOUT)
    local code = socket.skip(1, http.request{
        url = Api.server() .. path,
        method = "GET",
        headers = { ["Authorization"] = "Bearer " .. (Api.token() or "") },
        sink = sink,
    })
    socketutil:reset_timeout()
    file:close()
    if code ~= 200 then
        os.remove(dest)
        return false, type(code) == "number" and ("HTTP " .. code) or tostring(code)
    end
    return true
end

-- A refusal that sending again won't fix (bad input, revoked key); anything else is worth retrying.
function Api.isPermanent(status)
    return status ~= nil and status >= 400 and status < 500 and status ~= 408 and status ~= 429
end

return Api
