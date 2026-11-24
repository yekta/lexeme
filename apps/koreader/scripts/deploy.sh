#!/bin/sh
# Copies the plugin to the Kindle over SSH and restarts KOReader.
# KINDLE_HOST is an ssh host, `kindle` by default.
set -e
HOST="${KINDLE_HOST:-kindle}"
PLUGINS=/mnt/us/koreader/plugins
cd "$(dirname "$0")/.."

tar -cf - lexeme.koplugin | ssh "$HOST" "rm -rf $PLUGINS/lexeme.koplugin && tar -C $PLUGINS -xf -"

# Amazon's reader draws text with the Kindle's own FreeType, which renders through Monotype's
# iType; KOReader uses it too. crengine and MuPDF need patches/ (scripts/build-engine.sh) to
# work with iType, so all three are installed only when that build exists for this KOReader.
VERSION=$(ssh "$HOST" cat /mnt/us/koreader/git-rev)
if [ -f "build/$VERSION/libs/libkoreader-cre.so" ] && [ -f "build/$VERSION/libs/libwrap-mupdf.so" ]; then
  for lib in libkoreader-cre.so libwrap-mupdf.so; do
    ssh "$HOST" "cat > /mnt/us/koreader/libs/$lib.new && mv /mnt/us/koreader/libs/$lib.new /mnt/us/koreader/libs/$lib" < "build/$VERSION/libs/$lib"
  done
  ssh "$HOST" 'cp /usr/lib/libfreetype.so.6 /mnt/us/koreader/libs/libfreetype.so.6.new && mv /mnt/us/koreader/libs/libfreetype.so.6.new /mnt/us/koreader/libs/libfreetype.so.6'
else
  echo "No engine build for KOReader $VERSION; text keeps KOReader's own FreeType. Run scripts/build-engine.sh." >&2
fi

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
