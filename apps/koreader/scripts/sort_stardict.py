"""Puts a StarDict dictionary's .idx and .syn in the order KOReader's sdcv looks words up in.

sdcv finds a word by binary search, comparing words with g_ascii_strcasecmp and then strcmp: only
A-Z fold to a-z, every other byte compares as it is. xxyzz's Wiktionary dictionaries are sorted with
"É" beside "é", so sdcv misses words like "école" or "égout" and falls back to unrelated fuzzy
matches ("agouti", "goût"). The definitions (.dict.dz) stay as they are; .syn entries are
renumbered to follow their headwords.

    python3 scripts/sort_stardict.py "Wiktionary French-English/fr-en.ifo" sorted/

Copy the .idx and .syn it writes over the dictionary's, and delete its .oft caches.
"""
import os
import struct
import sys


def fold(word):
    return bytes(c + 32 if 65 <= c <= 90 else c for c in word)


def key(word):
    return fold(word), word


def read(path, tail):
    """(word, the bytes after it) for each entry."""
    data = open(path, "rb").read()
    entries, pos = [], 0
    while pos < len(data):
        end = data.index(b"\0", pos)
        entries.append((data[pos:end], data[end + 1:end + 1 + tail]))
        pos = end + 1 + tail
    return entries


def out_of_order(entries):
    return sum(1 for a, b in zip(entries, entries[1:]) if key(a[0]) > key(b[0]))


def write(path, entries):
    with open(path, "wb") as f:
        for word, tail in entries:
            f.write(word + b"\0" + tail)


def main(ifo, out_dir):
    base = ifo[:-len(".ifo")]
    name = os.path.basename(base)
    info = open(ifo, encoding="utf-8").read()
    idx = read(base + ".idx", 12 if "idxoffsetbits=64" in info else 8)
    order = sorted(range(len(idx)), key=lambda i: key(idx[i][0]))
    position = {old: new for new, old in enumerate(order)}
    os.makedirs(out_dir, exist_ok=True)
    sorted_idx = [idx[old] for old in order]
    write(os.path.join(out_dir, name + ".idx"), sorted_idx)
    print("%s.idx: %d entries, %d were out of order, now %d" % (name, len(idx), out_of_order(idx),
                                                                 out_of_order(sorted_idx)))
    if os.path.exists(base + ".syn"):
        syn = read(base + ".syn", 4)
        before = out_of_order(syn)
        syn = [(word, struct.pack(">I", position[struct.unpack(">I", tail)[0]])) for word, tail in syn]
        syn.sort(key=lambda entry: key(entry[0]))
        write(os.path.join(out_dir, name + ".syn"), syn)
        print("%s.syn: %d entries, %d were out of order, now %d" % (name, len(syn), before, out_of_order(syn)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
