#!/bin/sh
# Dev mode for working on the plugin with someone's real Kindle: `on` snapshots
# everything reading leaves behind (statistics, look-ups, highlights, positions,
# history, the sync outbox) and pauses syncing; `off` puts the snapshot back, so
# nothing done in between counts, and syncing resumes. While it's on, the
# frontlight is off and the Kindle doesn't sleep; `off` restores both.
# `status` says which.
# With LEXEME_SERVER and LEXEME_TOKEN set, `on` points the Kindle at that Lexeme
# (a dev stack) instead, and syncing to it stays on.
# KINDLE_HOST is an ssh host, `kindle` by default.
set -e
HOST="${KINDLE_HOST:-kindle}"
case "$1" in on | off | status) ;; *) echo "usage: dev-mode.sh on|off|status" >&2; exit 1 ;; esac

ssh "$HOST" "MODE=$1 LEXEME_SERVER='${LEXEME_SERVER:-}' LEXEME_TOKEN='${LEXEME_TOKEN:-}' sh -s" <<'EOF'
set -e
KO=/mnt/us/koreader
SNAP=/mnt/us/lexeme-dev/snapshot

stop_koreader() {
  pid=$(pidof reader.lua | tr " " "\n" | sort -n | head -1)
  if [ -n "$pid" ]; then kill "$pid"; fi
  for _ in $(seq 1 30); do
    pidof reader.lua >/dev/null || ps | grep -q "[k]oreader.sh" || break
    sleep 1
  done
}

start_koreader() {
  nohup /var/local/kmc/bin/kpm launch koreader --asap >/dev/null 2>&1 &
}

set_flag() {
  cd "$KO" && ./luajit -e "
    require('setupkoenv')
    local settings = require('luasettings'):open('settings.reader.lua')
    if $1 then settings:saveSetting('lexeme_dev_mode', true) else settings:delSetting('lexeme_dev_mode') end
    settings:flush()" >/dev/null 2>&1
}

use_server() {
  cd "$KO" && ./luajit -e "
    require('setupkoenv')
    local settings = require('luasettings'):open('settings.reader.lua')
    settings:saveSetting('lexeme_server', '$LEXEME_SERVER')
    settings:saveSetting('lexeme_token', '$LEXEME_TOKEN')
    for _, key in ipairs({ 'lexeme_user_email', 'lexeme_deck_id', 'lexeme_deck_name' }) do settings:delSetting(key) end
    settings:flush()" >/dev/null 2>&1
}

# Everything reading writes, relative to /.
tracked() {
  cd /
  for f in mnt/us/koreader/settings/statistics.sqlite3 mnt/us/koreader/settings/vocabulary_builder.sqlite3 \
    mnt/us/koreader/settings/lookup_history.lua mnt/us/koreader/settings/lexeme_* \
    mnt/us/koreader/history.lua mnt/us/koreader/settings.reader.lua mnt/us/koreader/docsettings; do
    [ -e "$f" ] && echo "$f"
  done
  find mnt/us/documents -name "*.sdr" -type d -prune 2>/dev/null || true
}

case "$MODE" in
  status)
    if [ -d "$SNAP" ]; then echo "Dev mode is on (snapshot from $(date -r "$SNAP/data.tar"))"; else echo "Dev mode is off"; fi
    ;;
  on)
    if [ -d "$SNAP" ]; then echo "Dev mode is already on"; exit 0; fi
    stop_koreader
    rm -rf "$SNAP.partial"
    mkdir -p "$SNAP.partial"
    tracked > "$SNAP.partial/files"
    (cd / && tar -cf "$SNAP.partial/data.tar" -T "$SNAP.partial/files")
    lipc-get-prop com.lab126.powerd flIntensity > "$SNAP.partial/brightness"
    mv "$SNAP.partial" "$SNAP"
    lipc-set-prop com.lab126.powerd flIntensity 0
    lipc-set-prop com.lab126.powerd preventScreenSaver 1
    set_flag true
    if [ -n "$LEXEME_SERVER" ] && [ -n "$LEXEME_TOKEN" ]; then
      use_server
      echo "Using Lexeme at $LEXEME_SERVER"
    fi
    start_koreader
    echo "Dev mode on: syncing paused, reading data saved, frontlight off, sleep prevented"
    ;;
  off)
    if [ ! -d "$SNAP" ]; then echo "Dev mode is already off"; exit 0; fi
    if [ ! -s "$SNAP/data.tar" ]; then echo "Snapshot is incomplete; not restoring" >&2; exit 1; fi
    stop_koreader
    (cd / && tracked | while read -r f; do rm -rf "/$f"; done)
    (cd / && tar -xf "$SNAP/data.tar")
    if [ -s "$SNAP/brightness" ]; then lipc-set-prop com.lab126.powerd flIntensity "$(cat "$SNAP/brightness")"; fi
    lipc-set-prop com.lab126.powerd preventScreenSaver 0
    rm -rf "$SNAP"
    set_flag false
    start_koreader
    echo "Dev mode off: reading data, frontlight and sleep restored, syncing resumed"
    ;;
esac
EOF
