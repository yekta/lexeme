#!/bin/sh
# Copies the plugin to the Kindle over SSH and restarts KOReader.
# KINDLE_HOST is an ssh host, `kindle` by default.
set -e
HOST="${KINDLE_HOST:-kindle}"
PLUGINS=/mnt/us/koreader/plugins
cd "$(dirname "$0")/.."

tar -cf - lexeme.koplugin | ssh "$HOST" "rm -rf $PLUGINS/lexeme.koplugin && tar -C $PLUGINS -xf -"

# Amazon's reader draws text with the Kindle's own FreeType, which renders through Monotype's
# iType; KOReader uses it too. crengine, MuPDF and HarfBuzz need patches/ (scripts/build-engine.sh)
# to work with iType and older FreeTypes, so they are installed only when that build exists for
# this KOReader.
VERSION=$(ssh "$HOST" cat /mnt/us/koreader/git-rev)
ENGINE="libkoreader-cre.so libwrap-mupdf.so libharfbuzz.so.0"
BUILT=yes
for lib in $ENGINE; do [ -f "build/$VERSION/libs/$lib" ] || BUILT=; done
if [ -n "$BUILT" ]; then
  for lib in $ENGINE; do
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
# KOReader restarts itself (lexeme/devrestart.lua). Killing it from outside makes its launcher
# toggle the Kindle's own services, which has failed to read the frontlight and crashed the Kindle.
mkdir -p /mnt/us/lexeme-dev
before=$(pidof reader.lua)
touch /mnt/us/lexeme-dev/restart-request
for _ in $(seq 1 20); do
  sleep 1
  now=$(pidof reader.lua)
  [ -n "$now" ] && [ "$now" != "$before" ] && { echo "KOReader restarted."; exit 0; }
done
rm -f /mnt/us/lexeme-dev/restart-request
echo "KOReader didn't restart by itself (the running Lexeme predates the restart hook)." >&2
echo "Restart it from Lexeme: Settings > Device options > Restart KOReader." >&2
EOF
