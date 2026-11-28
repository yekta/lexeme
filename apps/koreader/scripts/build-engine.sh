#!/bin/sh
# Builds KOReader's crengine, MuPDF and HarfBuzz libraries for the Kindle with patches/ applied.
# Usage: build-engine.sh [KOREADER_VERSION], e.g. v2026.07.1; defaults to the version on the Kindle.
# Needs Docker able to run linux/amd64 images (Rosetta on Apple silicon). The libraries land in
# build/<version>/libs/, where deploy.sh picks it up.
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
    for p in /patches/base-*.patch; do git apply \"\$p\"; done
    for p in /patches/crengine-*.patch; do git -C thirdparty/kpvcrlib/crengine apply \"\$p\"; done
    for p in /patches/mupdf-*.patch; do
      cp \"\$p\" thirdparty/mupdf/
      sed -i \"/^list(APPEND PATCH_FILES/,/^)/ s|^)|    \$(basename \"\$p\")\\n)|\" thirdparty/mupdf/CMakeLists.txt
    done
    for p in /patches/harfbuzz-*.patch; do
      cp \"\$p\" thirdparty/harfbuzz/
      sed -i \"/^external_project(/i list(APPEND PATCH_FILES \$(basename \"\$p\"))\" thirdparty/harfbuzz/CMakeLists.txt
    done
    make TARGET=kindlehf -j\$(nproc) koreader-cre wrap-mupdf >/dev/null
    cd build/arm-kindlehf-linux-gnueabihf/libs
    cp libkoreader-cre.so libwrap-mupdf.so libharfbuzz.so.0 /out/
  "
echo "Built $OUT"
