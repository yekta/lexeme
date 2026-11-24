# Lexeme for KOReader

`lexeme.koplugin` replaces KOReader's interface with a Kindle-style one and
sends words and reading data to Lexeme.

## Working on a Kindle

The scripts reach the Kindle over SSH. Set `KINDLE_HOST` to an SSH host
(an entry in `~/.ssh/config` with key login as root); the default is `kindle`.

- `pnpm run deploy` (`scripts/deploy.sh`) copies the plugin, checks every file
  compiles, and restarts KOReader. Wait about 25 seconds after a restart
  before tapping; earlier touches are dropped.
- `scripts/dev-mode.sh on` before testing on a Kindle someone reads on: it
  snapshots what reading leaves behind (statistics, look-ups, highlights,
  positions, history, the sync outbox) and pauses syncing, with "Dev Mode" shown by
  the clock. When you're done, go back to the Home screen, then
  `scripts/dev-mode.sh off` restores the snapshot and resumes syncing;
  `status` says which is on.
- `python3 scripts/kindle.py shot out.png` saves a framebuffer screenshot.
- `python3 scripts/kindle.py tap X Y` / `hold X Y` / `swipe X1 Y1 X2 Y2`
  inject touches. Coordinates are framebuffer pixels (1272 × 1696 on a
  Paperwhite).

### Text rendering

Amazon's reader draws text with the Kindle's own FreeType
(`/usr/lib/libfreetype.so.6`), which hands glyphs to Monotype's iType
rasterizer. `deploy.sh` copies that library into KOReader, so book text comes
out pixel for pixel as on Amazon's reader. iType pads glyph rows, which stock
crengine doesn't handle, and reports glyph widths differently from FreeType's
own drivers, which breaks MuPDF's layout of dictionary entries. `patches/`
fixes both and `scripts/build-engine.sh` builds crengine and MuPDF for the
KOReader version on the Kindle with Docker (it needs to run `linux/amd64`
images; on Apple silicon use a Rosetta VM, e.g.
`colima start --vm-type vz --vz-rosetta`). `deploy.sh` installs them and the
FreeType only when that build matches the Kindle's KOReader. A KOReader
update replaces them; build again for the new version.

### Rules that keep the Kindle alive

- Touches must look like a finger: tracking id 0, a growing
  `ABS_MT_TOUCH_MAJOR`, a few frames of drift over about 0.15 s.
  `kindle.py` builds them that way and plays them on the device with
  `scripts/touch.lua`, because sending frames one by one over SSH stretches a
  tap into a long press. Amazon's reader segfaults on one-frame touches; don't
  send raw events any other way.
- Give Amazon's reader time between taps (4–6 s, longer at big font sizes).
  Tapping its Aa sliders while it is still laying the book out crashes it.
- Never `stop kppmainapp`. It counts as a crash, leaves crash reports in the
  library and shows "Application Error". If Amazon's UI hangs or goes blank,
  reboot (`ssh $KINDLE_HOST reboot`). After a crash, delete the
  `/mnt/us/documents/<date>.txt|.tgz|.sdr` reports and
  `/mnt/us/.hidden/filtered_core/*.core`.
- The Kindle's `/tmp` is RAM. Filling it takes the whole UI down. Keep
  scratch files under `/mnt/us` (`kindle.py` uses `/mnt/us/lexeme-dev`).
- Amazon's stock UI ignores injected swipes; use its scroll arrows instead.
- Amazon's reading settings live in
  `/var/local/kpp/<account>ksdk-presets.db` (the active preset's
  `FONT_SIZE`, `LINE_SPACING_V2`, `FONT_BOLDNESS`, … rows). The reader reads
  them only at startup. Put the user's settings back when you're done.

### Leaving KOReader

KOReader takes over the screen. To get back to Amazon's UI, use
Exit KOReader from the Home ⋮ menu, or kill `reader.lua` over SSH.
