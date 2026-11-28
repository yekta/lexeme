#!/bin/sh
# Imports Amazon's reading history over SSH, as Settings > Reading options > Import Amazon reading
# history does: copies Kindle.zip from Amazon's "Request your data" to the Kindle's top folder and
# imports it with KOReader stopped, as dev-mode.sh stops it.
#   scripts/import-amazon-history.sh Kindle.zip
# KINDLE_HOST is an ssh host, `kindle` by default.
set -e
HOST="${KINDLE_HOST:-kindle}"
if [ ! -f "$1" ]; then echo "usage: import-amazon-history.sh Kindle.zip" >&2; exit 1; fi

scp -q "$1" "$HOST:/mnt/us/Kindle.zip"
ssh "$HOST" 'sh -s' <<'EOF'
if [ -d /mnt/us/lexeme-dev/snapshot ]; then echo "Dev mode is on: dev-mode.sh off will undo this import." >&2; fi

pid=$(pidof reader.lua | tr " " "\n" | sort -n | head -1)
if [ -n "$pid" ]; then kill "$pid"; fi
for _ in $(seq 1 30); do
  pidof reader.lua >/dev/null || ps | grep -q "[k]oreader.sh" || break
  sleep 1
done

cd /mnt/us/koreader && ./luajit -e "
  require('setupkoenv')
  package.path = 'plugins/lexeme.koplugin/?.lua;' .. package.path
  G_reader_settings = require('luasettings'):open('settings.reader.lua')
  local home = G_reader_settings:readSetting('home_dir') or '/mnt/us/documents'
  local result, failure = require('lexeme/amazon_history').import('/mnt/us/Kindle.zip', home)
  if not result then
    print(failure)
    os.exit(1)
  end
  G_reader_settings:flush()
  print(string.format('Imported %d sessions of %d books, %.1f hours.', result.sessions, result.books,
    result.seconds / 3600))"
status=$?

nohup /var/local/kmc/bin/kpm launch koreader --asap >/dev/null 2>&1 &
exit $status
EOF
