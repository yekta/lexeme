# Lexeme for KOReader

`lexeme.koplugin` replaces KOReader's interface with a Kindle-style one and
sends words and reading data to Lexeme.

## Working on a Kindle

The scripts reach the Kindle over SSH. Set `KINDLE_HOST` to an SSH host
(an entry in `~/.ssh/config` with key login as root); the default is `kindle`.

- `pnpm run deploy` (`scripts/deploy.sh`) copies the plugin, checks every file
  compiles, and has KOReader restart itself, which it only listens for in dev
  mode. Wait about 25 seconds after a restart before tapping; earlier touches
  are dropped.
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
- To keep the Kindle from going to sleep on its own, for long unattended runs,
  create `/mnt/us/lexeme-dev/stay-awake` on it; the power button still puts it
  to sleep. Delete the file to let it sleep on its own again. Dev mode does
  this too.
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
transformed font, so neither would load at all. `patches/` fixes these, and
also speeds crengine up (see Opening long books below).
`scripts/build-engine.sh` builds crengine, MuPDF and HarfBuzz for the KOReader
version on the Kindle with Docker (it needs to run `linux/amd64` images; on
Apple silicon use a Rosetta VM, e.g. `colima start --vm-type vz --vz-rosetta`).
`deploy.sh` installs them and the FreeType only when that build matches the
Kindle's KOReader and was built from `patches/` as they are now (otherwise it
says so and the Kindle keeps the engine it has), and HarfBuzz only on a Kindle
whose FreeType lacks `FT_Get_Transform`. A KOReader update replaces them; build
again for the new version.

### Verb forms in the dictionary

The dictionary sheet says which conjugation a French word is, in French
grammar's terms ("oblique is a form of obliquer: présent de l'indicatif et du
subjonctif (je, il/elle); impératif (tu)"), from `lexeme_forms.sqlite3` in
`koreader/settings/`. `scripts/french_forms.py` builds it from kaikki.org's
French Wiktionary data (about 60 MB to download, 7.8 MB built); without it the
sheet just leaves the line out.

### Bluetooth

On a Kindle with Bluetooth, Settings > Wi-Fi and Bluetooth and Quick Actions
turn it on and off, and connect devices already paired in the Kindle's own
Settings, through Amazon's Bluetooth service (`com.lab126.btfd`, the same
`BTenable "1:6"`/`"0:6"`, `Connect` and `Disconnect` its Settings uses).
Pairing stays in Amazon's Settings.

### Dictionaries

KOReader looks words up with sdcv, which needs a dictionary's `.idx` and
`.syn` sorted with only A–Z folded to lowercase. xxyzz's Wiktionary
dictionaries sort "É" beside "é", so sdcv misses words like "école" or
"égout" and shows unrelated fuzzy matches instead.
`scripts/sort_stardict.py <dictionary.ifo> <out dir>` re-sorts both files;
copy them over the dictionary's and delete its `.oft` caches.

### Kindle locations

A book whose conversion marked each of the Kindle's locations in its text
(`<span id="lexeme_loc_N"/>`, or where a file or an element with an id starts,
listed by spine item in `META-INF/lexeme-locations.txt`) takes its locations
from those marks: a page's location is the last one marked before it, found by
a binary search in reading order, without laying anything out. A book
converted from Amazon's copy in `Downloads/Items01` takes them from that copy's
location map instead, and any other book gets Amazon's rule of one location
per 150 bytes of HTML (see `lexeme/locations.lua`).

### Opening long books

crengine's cache of laid-out books is read through `/mnt/base-us`, the FAT
partition under Amazon's FUSE layer at `/mnt/us`, where long books' caches
load a second sooner; Lexeme keeps 1 GB of them. The spinner shown while a
book opens turns at four frames a second from frames drawn beforehand, and
stays still for book files over 8 MB, whose layout needs the memory.

A book with a layout cache opens without the loading screen: the cover says
"Opening" until the book shows. The engine's start-up and the two garbage
collections KOReader runs before every opening are done while Home sits idle.

crengine styles each element as it loads a book, so Lexeme sets its stylesheet
and margins before loading, reading the book's own stylesheets from the EPUB:
set afterwards, they made crengine style the whole book again.
`patches/crengine-css-class-index.patch` indexes a stylesheet's selectors by
the class they require, so each element is checked only against the selectors
it can match. Books converted from KFX carry a thousand class selectors, and
checking them all against every element took half of a long book's loading.
`crengine-css-shared-states.patch` shares the style states elements inherit
instead of copying them; `crengine-faster-loading*.patch` unzips and checksums
the book on other threads and parses it faster. `crengine-text-layout*.patch`
lays paragraphs out in fewer passes, and `crengine-text-shaping.patch` keeps
what HarfBuzz returns for each word, so with best kerning a word is shaped
once rather than every time it appears. Pages come out pixel for pixel as
KOReader's own engine draws them (checked on five books and two made-up ones
covering other scripts and MathML, with and without HarfBuzz). Virginia
Woolf's complete works (23.6 million characters) first opened in 103 seconds
with best kerning and now in 47. The loading patch also fixes a crengine bug
that could draw MathML limits off to the side, depending on what memory held.

With `base-cre-update-cache.patch`, crengine writes a book's layout cache in
short slices while it is being read (`lexeme/cachesave.lua`), so the first
close of a long book no longer waits for it: Woolf's took 5.7 seconds and now
takes 0.4.

### Links, footnotes and Back to location

Lexeme follows links and notes as Amazon's reader does (measured off it, see
`lexeme/notes.lua` and `lexeme/backstack.lua`):

- A note the book marks as a footnote or an endnote (`epub:type`, as Amazon's
  KFX conversion writes them) opens in a sheet at the bottom of the page. The
  note in it is drawn by crengine as it stands in the book, so it looks the
  same as there. "Go to footnotes" goes to it and points at it.
- Any other link is followed, and a "Back to loc 323 / Stay here" bar takes the
  line under the page's place until one of them is tapped.
- A jump from the table of contents, the slider, Go to, a search result, a note
  or the page grid keeps the toolbar open with a "Back to loc 2,147" button, and
  a dot on the slider for each place it can go back to. Which places it keeps
  follows Amazon's rules, written out in `backstack.lua`.
- A long press on a note's number doesn't select it.

KOReader's in-page footnotes (on by default) are left out of the stylesheet:
the Kindle keeps notes where the book has them, at the text's size. That
changed the stylesheet, so each book is laid out once more the first time it
opens.

### Sizes on a Paperwhite 5

Amazon's reader draws the same pixel sizes on a Paperwhite 5 as on a
Paperwhite 12 (both 300 dpi) and pins things to the screen's edges, while
`D.s` scales everything to the narrower screen. The toolbar, the Go To panel,
the footnote sheet, the link bar, the status line and the line under the page
use `D.px`, `D.right` and `D.bottom` instead, and match Amazon's on a
Paperwhite 5 to a pixel or two. Amazon's keyboard is its own case: on a
Paperwhite 5 it has measurements of its own, kept in `keyboard.lua`. Pressed
buttons show from the moment a finger touches them and stay about a quarter of
a second after it lifts, as on the Kindle.

### Vocabulary Builder

Lexeme keeps every word looked up while reading in
`koreader/settings/lexeme_vocabulary.sqlite3`, with the sentence it was read
in, the book and its language. The language comes from the dictionary that
had the word, the sentence around it, then the book's metadata. The first time
Vocabulary Builder opens, it brings in Amazon's own list
(`system/vocabulary/vocab.db`, which Amazon trims to 2,000 words; a full copy
saved as `koreader/settings/lexeme_amazon_vocab.db` is read too) and
KOReader's lookup history. It's on the reader's and Home's ⋮ menus, and
Settings > Reading options turns the recording off. While a Lexeme account is
connected, a word's card adds it to Lexeme and Study in Lexeme opens the
Lexeme tab; without one, words are marked Mastered and studied on Amazon's
flashcards. Either way the list stays on the Kindle: what reaches Lexeme is
KOReader's lookup history, as before.

### Amazon reading history

`scripts/amazon_history.py` reads the Kindle part of Amazon's "Request your
data" export. Written as `.json`, it's for Lexeme's `import-reading`, so the
sessions count in Lexeme's stats everywhere; written as `.sqlite3`
(`lexeme_history.sqlite3` in `koreader/settings/`), it feeds the stats Home
counts on a Kindle without a Lexeme account.

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
