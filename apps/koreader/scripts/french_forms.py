"""Builds lexeme_forms.sqlite3: which conjugation of which French verb a word is.

The dictionary sheet shows "oblique is a form of obliquer: présent de l'indicatif et du subjonctif
(je, il/elle); impératif (tu)" above the verb's entry, in the terms French grammar is taught in.
The data is English Wiktionary's, as extracted by Wiktextract and published by kaikki.org:

    curl -LO https://kaikki.org/dictionary/French/kaikki.org-dictionary-French.jsonl.gz
    python3 scripts/french_forms.py kaikki.org-dictionary-French.jsonl.gz lexeme_forms.sqlite3

Copy the result to koreader/settings/ on the Kindle.
"""
import collections
import gzip
import json
import os
import sqlite3
import sys

PERSONS = ["first", "second", "third"]
PRONOUNS = {
    ("first", "singular"): "je", ("second", "singular"): "tu", ("third", "singular"): "il/elle",
    ("first", "plural"): "nous", ("second", "plural"): "vous", ("third", "plural"): "ils/elles",
}
PRONOUN_ORDER = list(PRONOUNS.values())
# The tags of each tense, in the order French grammars list them, its name and its mood.
TENSES = [
    ({"present", "indicative"}, "présent", "indicatif"),
    ({"imperfect", "indicative"}, "imparfait", "indicatif"),
    ({"historic", "past"}, "passé simple", None),
    ({"future"}, "futur simple", None),
    ({"conditional"}, "conditionnel présent", None),
    ({"present", "subjunctive"}, "présent", "subjonctif"),
    ({"imperfect", "subjunctive"}, "imparfait", "subjonctif"),
    ({"imperative"}, "impératif", None),
]
MOODS = {"indicatif": "de l'indicatif", "subjonctif": "du subjonctif"}
GENDERS = {"masculine": "masculin", "feminine": "féminin"}
NUMBERS = {"singular": "singulier", "plural": "pluriel"}
SKIPPED_TAGS = {"table-tags", "inflection-template", "multiword-construction", "infinitive", "reflexive"}


def participle(tags):
    """ "participe passé", or with its agreement: "participe passé (féminin pluriel)"."""
    name = "participe présent" if "present" in tags else "participe passé"
    agreement = " ".join(filter(None, [next((GENDERS[g] for g in GENDERS if g in tags), None),
                                       next((NUMBERS[n] for n in NUMBERS if n in tags), None)]))
    return name + (" (" + agreement + ")" if agreement else "")


def describe(tag_sets):
    """ "présent de l'indicatif et du subjonctif (je, il/elle); impératif (tu)" for a form's tag sets.

    A set may name several persons, numbers and moods at once, as Wiktionary's own entries do."""
    pronouns, participles = collections.defaultdict(set), []
    for tags in tag_sets:
        if "participle" in tags:
            text = participle(tags)
            if text not in participles:
                participles.append(text)
            continue
        persons = [p for p in PERSONS if p + "-person" in tags]
        numbers = [n for n in ("singular", "plural") if n in tags]
        for i, (needed, _, _) in enumerate(TENSES):
            if needed <= tags:
                for person in persons:
                    for number in numbers:
                        pronouns[i].add(PRONOUNS[(person, number)])
    parts, done = [], set()
    for i in sorted(pronouns):
        if i in done:
            continue
        _, name, mood = TENSES[i]
        who = " (" + ", ".join(p for p in PRONOUN_ORDER if p in pronouns[i]) + ")"
        # The same tense of the other mood with the same people: "présent de l'indicatif et du subjonctif".
        twin = next((j for j, (_, n, m) in enumerate(TENSES)
                     if j != i and n == name and m and mood and pronouns.get(j) == pronouns[i]), None)
        if twin is not None:
            done.add(twin)
            parts.append(name + " " + MOODS[mood] + " et " + MOODS[TENSES[twin][2]] + who)
        else:
            parts.append(name + (" " + MOODS[mood] if mood else "") + who)
    return "; ".join(parts + participles)


def main(source, target):
    table = collections.defaultdict(list)
    form_of = collections.defaultdict(list)
    with gzip.open(source, "rt", encoding="utf-8") as f:
        for line in f:
            entry = json.loads(line)
            if entry.get("pos") != "verb":
                continue
            word = entry.get("word", "")
            for form in entry.get("forms", []):
                text, tags = form.get("form", ""), set(form.get("tags", []))
                if form.get("source") != "conjugation" or not text or tags & SKIPPED_TAGS:
                    continue
                if " " in text or "'" in text or "’" in text:
                    continue
                table[(text, word)].append(tags)
            for sense in entry.get("senses", []):
                for of in sense.get("form_of") or []:
                    if of.get("word") and of["word"] != word:
                        form_of[(word, of["word"])].append(set(sense.get("tags", [])) - {"form-of"})

    # The verbs each past participle belongs to, so "dissuadée" is shown under "dissuader" too.
    verbs_of = collections.defaultdict(set)
    for (form, verb), tag_sets in table.items():
        if any({"participle", "past"} <= tags for tags in tag_sets):
            verbs_of[form].add(verb)
    for (form, lemma), tag_sets in list(form_of.items()):
        if (form, lemma) in table:
            continue
        for verb in verbs_of.get(lemma, ()):
            if all("participle" in tags for tags in tag_sets) and (form, verb) not in table:
                form_of[(form, verb)].extend(tags | {"past"} for tags in tag_sets)

    rows = {}
    for key, tag_sets in table.items():
        rows[key] = describe(tag_sets)
    for key, tag_sets in form_of.items():
        if key not in rows:
            rows[key] = describe(tag_sets)
    rows = {key: text for key, text in rows.items() if text}

    if os.path.exists(target):
        os.remove(target)
    db = sqlite3.connect(target)
    db.executescript("""
        CREATE TABLE descriptions (id INTEGER PRIMARY KEY, text TEXT NOT NULL UNIQUE);
        CREATE TABLE forms (form TEXT NOT NULL, lemma TEXT NOT NULL, description INTEGER NOT NULL,
            PRIMARY KEY (form, lemma)) WITHOUT ROWID;
    """)
    ids = {}
    for text in sorted(set(rows.values())):
        ids[text] = db.execute("INSERT INTO descriptions (text) VALUES (?)", (text,)).lastrowid
    db.executemany("INSERT INTO forms VALUES (?, ?, ?)", ((f, l, ids[t]) for (f, l), t in sorted(rows.items())))
    db.commit()
    db.execute("VACUUM")
    db.close()
    print("%d forms, %d descriptions, %.1f MB" % (len(rows), len(ids), os.path.getsize(target) / 1048576))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
