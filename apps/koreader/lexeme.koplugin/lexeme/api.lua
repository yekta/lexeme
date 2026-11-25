-- Talks to the Lexeme server: JSON over HTTP(S), with the device's API key once paired.
local JSON = require("json")
local lfs = require("libs/libkoreader-lfs")
local http = require("socket.http")
local ltn12 = require("ltn12")
local socket = require("socket")
local socketutil = require("socketutil")

local Background = require("lexeme/background")

local Api = {}

local DEFAULT_SERVER = "https://api.lexeme.fyi"

function Api.server()
    return (G_reader_settings:readSetting("lexeme_server") or DEFAULT_SERVER):gsub("/+$", "")
end

function Api.isDefaultServer()
    return Api.server() == DEFAULT_SERVER
end

function Api.token()
    return G_reader_settings:readSetting("lexeme_token")
end

local function exchange(method, url, headers, encoded)
    local response = {}
    socketutil:set_timeout(socketutil.LARGE_BLOCK_TIMEOUT, socketutil.LARGE_TOTAL_TIMEOUT)
    local code, _, status = socket.skip(1, http.request{
        url = url,
        method = method,
        headers = headers,
        source = encoded and ltn12.source.string(encoded),
        sink = ltn12.sink.table(response),
    })
    socketutil:reset_timeout()
    if type(code) ~= "number" then return nil, tostring(status or code) end
    return code, table.concat(response)
end

--[[
Returns ok, body_or_error, status. `ok` is false for a network failure (try
again later) and for a refusal; `status` tells the two apart: nil when the
server was never reached.
]]
function Api.request(method, path, body, use_token)
    local headers = { ["Accept"] = "application/json" }
    local encoded
    if body then
        encoded = JSON.encode(body)
        headers["Content-Type"] = "application/json"
        headers["Content-Length"] = tostring(#encoded)
    end
    if use_token ~= false and Api.token() then
        headers["Authorization"] = "Bearer " .. Api.token()
    end
    local url = Api.server() .. path
    local code, text = Background.await(function() return exchange(method, url, headers, encoded) end)
    if not code then return false, text, nil end
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

local function fetchFile(url, token, dest)
    local file, open_err = io.open(dest, "wb")
    if not file then return false, tostring(open_err) end
    socketutil:set_timeout(socketutil.FILE_BLOCK_TIMEOUT, socketutil.FILE_TOTAL_TIMEOUT)
    local code = socket.skip(1, http.request{
        url = url,
        method = "GET",
        headers = { ["Authorization"] = "Bearer " .. token },
        sink = ltn12.sink.file(file),
    })
    socketutil:reset_timeout()
    if code ~= 200 then
        os.remove(dest)
        return false, type(code) == "number" and ("HTTP " .. code) or tostring(code)
    end
    return true
end

-- Downloads `path` into the file `dest`, calling `on_progress(received_bytes)` as it goes. Returns ok, error.
function Api.download(path, dest, on_progress)
    local url, token = Api.server() .. path, Api.token() or ""
    return Background.await(function() return fetchFile(url, token, dest) end, function()
        local size = lfs.attributes(dest, "size")
        if size and on_progress then on_progress(size) end
    end)
end

-- A refusal that sending again won't fix (bad input, revoked key); anything else is worth retrying.
function Api.isPermanent(status)
    return status ~= nil and status >= 400 and status < 500 and status ~= 408 and status ~= 429
end

return Api
