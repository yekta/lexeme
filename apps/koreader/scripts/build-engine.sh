#!/bin/sh
# Builds KOReader's crengine and FreeType libraries for the Kindle with patches/ applied.
# Usage: build-engine.sh [KOREADER_VERSION], e.g. v2026.07.1; defaults to the version on the Kindle.
# Needs Docker able to run linux/amd64 images (Rosetta on Apple silicon). The libraries land in
# build/<version>/libs/, where deploy.sh picks them up.
set -e
HOST="${KINDLE_HOST:-kindle}"
cd "$(dirname "$0")/.."
VERSION="${1:-$(ssh "$HOST" cat /mnt/us/koreader/git-rev)}"
OUT="$PWD/build/$VERSION/libs"
mkdir -p "$OUT"

docker run --rm --platform linux/amd64 -v "$PWD/patches:/patches:ro" -v "$OUT:/out" \
  koreader/kokindle:6.0.0-22.04 bash -ec "
    git clone -q --depth 1 --branch '$VERSION' https://github.com/koreader/koreader.git ~/koreader
    cd ~/koreader && git submodule update -q --init --depth 1 base
    cd base && git submodule update -q --init thirdparty/kpvcrlib/crengine
    git -C thirdparty/kpvcrlib/crengine apply /patches/crengine-autohint-full.patch
    cp /patches/freetype-keep-stem-widths.patch thirdparty/freetype2/
    sed -i 's/^    ftcalc_gcc12_arm_neon_fix.patch$/&\n    freetype-keep-stem-widths.patch/' thirdparty/freetype2/CMakeLists.txt
    grep -q freetype-keep-stem-widths.patch thirdparty/freetype2/CMakeLists.txt
    make TARGET=kindlehf -j\$(nproc) koreader-cre >/dev/null
    cp build/arm-kindlehf-linux-gnueabihf/libs/libkoreader-cre.so build/arm-kindlehf-linux-gnueabihf/libs/libfreetype.so.6 /out/
  "
echo "Built $OUT"
