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
  the clock. It also turns the frontlight off and keeps the Kindle from
  sleeping, since nobody is reading the screen and a sleeping Kindle drops off
  SSH. When you're done, go back to the Home screen, then
  `scripts/dev-mode.sh off` restores the snapshot, the brightness and sleep,
  and resumes syncing; `status` says which is on. To test what talks to
  Lexeme (syncing, studying), run a dev stack and turn dev mode on with
  `LEXEME_SERVER=http://<this machine>:<port> LEXEME_TOKEN=lx_…`: the Kindle
  uses that server, with syncing on, until `off`.
- `python3 scripts/kindle.py shot out.png` saves a framebuffer screenshot.
- `python3 scripts/kindle.py tap X Y` / `hold X Y` / `swipe X1 Y1 X2 Y2`
  inject touches. Coordinates are framebuffer pixels (1272 × 1696 on a
  Paperwhite 12, 1236 × 1648 on a Paperwhite 5).

### Text rendering

Amazon's reader draws text with the Kindle's own FreeType
(`/usr/lib/libfreetype.so.6`), which hands glyphs to Monotype's iType
rasterizer. `deploy.sh` copies that library into KOReader, so book text comes
out pixel for pixel as on Amazon's reader. iType pads glyph rows, which stock
crengine doesn't handle, and reports glyph widths differently from FreeType's
own drivers, which breaks MuPDF's layout of dictionary entries. Some Kindles'
FreeType (a Paperwhite 5 on 5.19.2, FreeType 2.9) is also older than
KOReader's. It lacks `FT_Error_String`, which crengine calls when logging an
error, and `FT_Get_Transform`, which HarfBuzz calls when sizing glyphs of a
transformed font, so neither would load at all. `patches/` fixes all four, and
`scripts/build-engine.sh` builds crengine, MuPDF and HarfBuzz for the KOReader
version on the Kindle with Docker (it needs to run `linux/amd64` images; on
Apple silicon use a Rosetta VM, e.g. `colima start --vm-type vz --vz-rosetta`).
`deploy.sh` installs them and the FreeType only when that build matches the
Kindle's KOReader. A KOReader update replaces them; build again for the new
version.

### Verb forms in the dictionary

The dictionary sheet says which conjugation a French word is, in French
grammar's terms ("oblique is a form of obliquer: présent de l'indicatif et du
subjonctif (je, il/elle); impératif (tu)"), from `lexeme_forms.sqlite3` in
`koreader/settings/`. `scripts/french_forms.py` builds it from kaikki.org's
French Wiktionary data (about 60 MB to download, 7.8 MB built); without it the
sheet just leaves the line out.

### Dictionaries

KOReader looks words up with sdcv, which needs a dictionary's `.idx` and
`.syn` sorted with only A–Z folded to lowercase. xxyzz's Wiktionary
dictionaries sort "É" beside "é", so sdcv misses words like "école" or
"égout" and shows unrelated fuzzy matches instead.
`scripts/sort_stardict.py <dictionary.ifo> <out dir>` re-sorts both files;
copy them over the dictionary's and delete its `.oft` caches.

### Vocabulary Builder

Lexeme keeps every word looked up while reading in
`koreader/settings/lexeme_vocabulary.sqlite3`, with the sentence it was read
in, the book and its language. The language comes from the dictionary that
had the word, the sentence around it, then the book's metadata. The first time
Vocabulary Builder opens, it brings in Amazon's own list
(`system/vocabulary/vocab.db`, which Amazon trims to 2,000 words; a full copy
saved as `koreader/settings/lexeme_amazon_vocab.db` is read too) and
KOReader's lookup history. It's on the reader's and Home's ⋮ menus, and
Settings > Reading options turns the recording off.

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
