#!/bin/sh
# Copies the plugin to the Kindle over SSH and restarts KOReader.
# KINDLE_HOST is an ssh host, `kindle` by default.
set -e
HOST="${KINDLE_HOST:-kindle}"
PLUGINS=/mnt/us/koreader/plugins
cd "$(dirname "$0")/.."

tar -cf - lexeme.koplugin | ssh "$HOST" "rm -rf $PLUGINS/lexeme.koplugin && tar -C $PLUGINS -xf -"

ssh "$HOST" 'sh -s' <<'EOF'
for f in $(find /mnt/us/koreader/plugins/lexeme.koplugin -name "*.lua"); do
  /mnt/us/koreader/luajit -e "assert(loadfile('$f'))" || exit 1
done
pid=$(pidof reader.lua | tr " " "\n" | sort -n | head -1)
[ -n "$pid" ] && kill "$pid"
for _ in $(seq 1 30); do
  pidof reader.lua >/dev/null || ps | grep -q "[k]oreader.sh" || break
  sleep 1
done
nohup /var/local/kmc/bin/kpm launch koreader --asap >/dev/null 2>&1 &
EOF
