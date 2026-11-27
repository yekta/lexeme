"""The Amazon reader's reading history, for Lexeme or for a Kindle without a Lexeme account.

    python3 scripts/amazon_history.py Kindle.zip amazon_history.json [cc.db] [My Clippings.txt]
    python3 scripts/amazon_history.py Kindle.zip lexeme_history.sqlite3 [cc.db] [My Clippings.txt]

Kindle.zip is the Kindle part of Amazon's "Request your data" export. cc.db, the Kindle's
library (/var/local/cc.db), adds titles for the books on the device. My Clippings.txt names
books the export doesn't: a highlight added while a book was open says which book that was.

With a Lexeme account, write .json: it's sync-reading's input, which Lexeme's import-reading
takes (more than 20,000 sessions go in numbered files, imported in order). Books get the keys
the Kindle's own import gives them, so the two land on the same books. Without one, write
.sqlite3 and copy it to koreader/settings/ on the Kindle; the plugin reads it for its stats.
"""
import bisect
import collections
import csv
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import zipfile
from datetime import datetime, timezone

SESSIONS = "Kindle.Devices.ReadingSession.csv"
INSIGHTS = "Kindle.reading-insights-sessions_with_adjustments.csv"
COMPLETED = "Kindle.UserUniqueTitlesCompleted.csv"
OWNERSHIP = "Digital.Content.Ownership.1.json"
MISSING = ("", "Not Available")
# Books read without an Amazon id (copied over USB) have none in the export; those named from
# My Clippings are keyed by this prefix and their title.
SIDELOADED = "sideloaded:"
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July",
                                      "August", "September", "October", "November", "December"], 1)}

SCHEMA = """
CREATE TABLE sessions (
    asin TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    seconds INTEGER NOT NULL,
    page_flips INTEGER,
    PRIMARY KEY (asin, started_at)
);
CREATE TABLE books (asin TEXT PRIMARY KEY, title TEXT, finished_at INTEGER);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
"""


def epoch(text):
    return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp())


def open_member(archive, name):
    found = [n for n in archive.namelist() if n.endswith("/" + name) or n == name]
    if not found:
        return None
    return archive.open(found[0])


def csv_rows(archive, name):
    member = open_member(archive, name)
    if not member:
        return []
    with member:
        return list(csv.DictReader(io.TextIOWrapper(member, encoding="utf-8-sig")))


def book_id(text):
    # Some ids come wrapped in quotes, others not; they're the same book.
    return text.strip('"')


def sessions(archive):
    """Reading sessions by (asin, start), Audible's left out; a session listed twice keeps its longer copy.
    Each also keeps its end, which naming books from My Clippings needs."""
    found = {}
    for row in csv_rows(archive, SESSIONS):
        if row["device_family"] == "Audible":
            continue
        if row["start_timestamp"] in MISSING or row["total_reading_millis"] in MISSING:
            continue
        seconds = round(float(row["total_reading_millis"]) / 1000)
        if seconds <= 0:
            continue
        flips = None if row["number_of_page_flips"] in MISSING else int(float(row["number_of_page_flips"]))
        key = (book_id(row["ASIN"]), epoch(row["start_timestamp"]))
        end = epoch(row["end_timestamp"]) if row["end_timestamp"] not in MISSING else key[1] + seconds
        if key not in found or seconds > found[key][0]:
            found[key] = (seconds, flips, end)
    return found


def titles(archive, library):
    """Titles by asin: Reading Insights first, then what was bought, then the Kindle's own library."""
    names = {}
    for row in csv_rows(archive, INSIGHTS):
        if row["product_name"] in MISSING:
            continue
        for key in (row["ASIN"], row["personal_document_id"]):
            if key not in MISSING:
                names[key] = row["product_name"]
    member = open_member(archive, OWNERSHIP)
    if member:
        with member:
            for record in json.load(member):
                resource = record.get("resource") or {}
                if resource.get("ASIN") and resource.get("Product Name"):
                    names[resource["ASIN"]] = resource["Product Name"]
    if library and os.path.exists(library):
        db = sqlite3.connect(f"file:{library}?mode=ro", uri=True)
        # A book with no Amazon id is reported by the Kindle's own id for it, p_uuid.
        for key, uuid, title in db.execute("SELECT p_cdeKey, p_uuid, p_titles_0_nominal FROM Entries "
                                           "WHERE p_titles_0_nominal IS NOT NULL"):
            for k in (key, uuid):
                if k:
                    names[k] = title
        db.close()
    return names


def clippings(path):
    """(time, title) of each clipping, in the Kindle's local time read as if it were UTC."""
    found = []
    if not path or not os.path.exists(path):
        return found
    with open(path, encoding="utf-8-sig") as f:
        entries = f.read().split("==========")
    for entry in entries:
        lines = [line.strip() for line in entry.strip().split("\n")]
        if len(lines) < 2:
            continue
        m = re.search(r"Added on \w+, (\d+) (\w+) (\d{4}) (\d+):(\d+):(\d+)", lines[1])
        if not m or m.group(2) not in MONTHS:
            continue
        day, month, year, hour, minute, second = m.groups()
        at = datetime(int(year), MONTHS[month], int(day), int(hour), int(minute), int(second), tzinfo=timezone.utc)
        found.append((at.timestamp(), lines[0]))
    return sorted(found)


def name_from_clippings(found, names, clips):
    """Names untitled books from highlights added while they were open, and splits the sessions of
    books read without an id by the book a highlight shows was open. Returns the new found and names.

    Clippings carry the Kindle's local time; the offset to the sessions' UTC is the one that puts
    the most clippings inside a session of a book with the same title."""
    if not clips:
        return found, names
    times = [t for t, _ in clips]

    def titles_between(start, end, offset):
        i = bisect.bisect_left(times, start + offset - 60)
        out = []
        while i < len(clips) and clips[i][0] <= end + offset + 60:
            out.append(clips[i][1])
            i += 1
        return out

    def same(a, b):
        return re.sub(r"\W+", " ", a.lower())[:25] == re.sub(r"\W+", " ", b.lower())[:25]

    titled = [(k, v) for k, v in found.items() if names.get(k[0])]
    offset = max(range(-12 * 3600, 14 * 3600 + 1, 3600), key=lambda off: sum(
        1 for (asin, start), (_, _, end) in titled[::7]
        if any(same(t, names[asin]) for t in titles_between(start, end, off))))

    votes = collections.defaultdict(collections.Counter)
    for (asin, start), (_, _, end) in found.items():
        if asin and not names.get(asin):
            seen = titles_between(start, end, offset)
            if seen:
                votes[asin].update(seen)
    for asin, counter in votes.items():
        names[asin] = counter.most_common(1)[0][0]

    # Sessions without an id: each is named by a highlight added during it; one between two
    # sessions of the same book, under two weeks apart, is taken to be that book too.
    side = sorted((start, key) for key in found for start in [key[1]] if key[0] == "")
    direct = []
    for start, key in side:
        counter = collections.Counter(titles_between(start, found[key][2], offset))
        direct.append(counter.most_common(1)[0][0] if counter else None)
    label = list(direct)
    named = [i for i, t in enumerate(direct) if t]
    for a, b in zip(named, named[1:]):
        if direct[a] == direct[b] and side[b][0] - found[side[a][1]][2] <= 14 * 86400:
            for i in range(a + 1, b):
                label[i] = direct[a]
    for (start, key), title in zip(side, label):
        if title:
            new_key = (SIDELOADED + title, start)
            found[new_key] = found.pop(key)
            names[new_key[0]] = title
    return found, names


def completed(archive):
    """When each title was finished, as Amazon recorded it: asin -> epoch seconds at noon UTC that day."""
    finished = {}
    for row in csv_rows(archive, COMPLETED):
        parts = row["asin_date_and_content_type"].split("_")
        if len(parts) < 3:
            continue
        asin = book_id(row["personal_document_id"] if row["personal_document_id"] not in MISSING else parts[0])
        at = epoch(parts[1] + "T12:00:00+00:00")
        finished[asin] = max(at, finished.get(asin, 0))
    return finished


def stable_id(text):
    """The UUID the Kindle plugin gives the same text (Reading.stableId)."""
    h = hashlib.md5(text.encode("utf-8")).hexdigest()
    variant = "%x" % (8 + int(h[16], 16) % 4)
    return f"{h[0:8]}-{h[8:12]}-4{h[13:16]}-{variant}{h[17:20]}-{h[20:32]}"


PAGE_READS_PER_FILE = 20_000


def write_lexeme(found, names, finished, out):
    """sync-reading's input: each titled book and its sessions, as page visits from another reader."""
    def key(asin):
        return "kindle-history:" + asin[len(SIDELOADED):] if asin.startswith(SIDELOADED) else "kindle:" + asin

    books = {}
    for asin in {asin for asin, _ in found} | set(finished):
        title = (names.get(asin) or "").strip()
        if not title:
            continue
        last = max((start for a, start in found if a == asin), default=0)
        books[asin] = {
            "id": stable_id("book:" + key(asin)),
            "key": key(asin),
            "title": title[:1000],
            "status": "finished" if asin in finished else "reading",
            "last_read_at": last * 1000 or None,
            "finished_at": finished[asin] * 1000 if asin in finished else None,
        }
    reads = [{
        "id": stable_id(f"amazon-session:{asin}:{start}"),
        "book_key": key(asin),
        "page": 0,
        "total_pages": 0,
        "started_at": start * 1000,
        "seconds": seconds,
        "imported": True,
    } for (asin, start), (seconds, _, _) in sorted(found.items(), key=lambda item: item[0][1]) if asin in books]
    if len(books) > 2000:
        sys.exit(f"{len(books)} books is more than one import takes (2,000).")
    chunks = [reads[i:i + PAGE_READS_PER_FILE] for i in range(0, len(reads), PAGE_READS_PER_FILE)] or [[]]
    stem, ext = os.path.splitext(out)
    for i, chunk in enumerate(chunks):
        path = out if i == 0 else f"{stem}-{i + 1}{ext}"
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"books": list(books.values()) if i == 0 else [], "page_reads": chunk}, f, ensure_ascii=False)
        print("Wrote", path)
    left_out = sum(1 for asin, _ in found if asin not in books)
    print(f"{len(reads)} sessions, {len(books)} books" + (f"; {left_out} sessions of untitled books left out"
                                                            if left_out else ""))


def build(export, out, library=None, clippings_path=None):
    with zipfile.ZipFile(export) as archive:
        found = sessions(archive)
        names = titles(archive, library)
        finished = completed(archive)
    found, names = name_from_clippings(found, names, clippings(clippings_path))
    if out.endswith(".json"):
        write_lexeme(found, names, finished, out)
        return
    if os.path.exists(out):
        os.remove(out)
    db = sqlite3.connect(out)
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO sessions VALUES (?, ?, ?, ?)",
                   [(asin, start, seconds, flips) for (asin, start), (seconds, flips, _) in found.items()])
    asins = {asin for asin, _ in found} | set(finished)
    db.executemany("INSERT INTO books VALUES (?, ?, ?)",
                   [(asin, names.get(asin), finished.get(asin)) for asin in sorted(asins)])
    last = max((start for _, start in found), default=0)
    db.executemany("INSERT INTO meta VALUES (?, ?)", [("source", "Amazon data export"), ("last_session_at", str(last))])
    db.commit()
    db.close()
    titled = sum(1 for asin in asins if names.get(asin))
    hours = sum(seconds for seconds, _, _ in found.values()) / 3600
    print(f"{len(found)} sessions, {hours:.0f} h, {len(asins)} books ({titled} with titles), "
          f"{len(finished)} finished, last session {datetime.fromtimestamp(last):%Y-%m-%d}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4, 5):
        sys.exit(__doc__)
    build(*sys.argv[1:])
