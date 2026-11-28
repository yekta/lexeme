"""Builds the plugin's kindle.css from KOReader's own stylesheets.

    python3 scripts/kindle_css.py <KOReader's data folder> > lexeme.koplugin/kindle.css

The data folder holds html5.css and epub.css (koreader/data on a Kindle). kindle.css is the rules
of html5.css that books use, then epub.css's, then the two places the Kindle differs, in one file
with no @import: crengine follows only one, so a stylesheet importing epub.css loses the html5.css
epub.css imports, and with it each EPUB file starting on a new page, italics for <i>, bold for <b>,
align attributes and more. Leaving out the rest of html5.css (form controls, frames, colours, ...)
keeps the stylesheet small: crengine parses it at every opening.
"""
import re
import sys

# The html5.css rules kept, in html5.css's order, each by its first selector (a selector listed twice
# takes the next rule starting with it); a function narrows a rule to the selectors it keeps.
IMG = lambda selector: selector.startswith("img")
HTML5_RULES = [
    # EPUB files each on a new page, footnotes and non-linear files, page-list markers.
    ("DocFragment", None), ("empty-line", None), ("DocFragment[NonLinear]", None),
    ("section[type=footnotes]", None), ("aside[type=footnote]", None), ("span[type=pagebreak]", None),
    # Hidden elements.
    ("area", None), ("input[type=hidden i]", lambda selector: selector == "[hidden]"),
    # Flow content (paragraph and blockquote margins come from epub.css).
    ("p[align=left i]", None), ("p[align=right i]", None), ("p[align=center i]", None),
    ("p[align=justify i]", None), ("blockquote", lambda selector: selector == "figure"), ("address", None),
    ("listing", None), ("pre[wrap]", None), ("center", None), ("div[align=left i]", None),
    ("div[align=right i]", None), ("div[align=middle i]", None), ("div[align=justify i]", None),
    # Phrasing content.
    ("cite", None), ("strong", None), ("samp", None), ("big", None), ("small", None), ("sub", None),
    ("sup", None), ("ruby", None), ("rb", None), ("rt", None), ("a[href]", None), ("mark", None),
    ("ins", None), ("del", None), ("q::before", None), ("q::after", None), ("nobr", None),
    ("nobr wbr", None), ("br[clear=left i]", None), ("br[clear=right i]", None), ("br[clear=all i]", None),
    ("font[size]", None),
    # Headings' align attribute (their sizes and margins come from epub.css).
    ("h6[align=left i]", None), ("h6[align=right i]", None), ("h6[align=center i]", None),
    ("h6[align=justify i]", None),
    # Lists.
    ("dl", None), ("dir", None), ("ol", None), ("ol[type=1]", None), ("ol[type=a]", None),
    ("ol[type=A]", None), ("ol[type=i]", None), ("ol[type=I]", None), ("ul[type=none i]", None),
    ("ul[type=disc i]", None), ("ul[type=circle i]", None), ("ul[type=square i]", None),
    # Tables.
    ("table", None), ("caption", None), ("thead", None), ("tr", None), ("thead", None), ("th", None),
    ("td", None), ("table[align=left i]", None), ("table[align=right i]", None),
    ("table[align=center i]", None), ("thead[align=left i]", None), ("thead[align=justify i]", None),
    ("thead[align=right i]", None), ("thead[align=center i]", None), ("thead[align=absmiddle i]", None),
    ("caption[align=bottom i]", None), ("thead[valign=top i]", None), ("thead[valign=middle i]", None),
    ("thead[valign=bottom i]", None), ("thead[valign=baseline i]", None), ("th[nowrap]", None),
    ("table[border]", None), ("table[border] > :where(thead, tbody, tfoot) > tr > th", None),
    ("table[cellspacing]", None), ("table[cellpadding] > :where(thead, tbody, tfoot) > tr > th", None),
    ("table[height]", None), ("th[height]", None), ("table[width]", None), ("col[width]", None),
    # Horizontal rules.
    ("hr", None), ("hr[align=left i]", None), ("hr[align=right i]", None), ("hr[align=center i]", None),
    ("hr[color]", None), ("hr[size]", None), ("hr[width]", None),
    # Images' presentational attributes.
    ("embed[align=left i]", IMG), ("embed[align=right i]", IMG), ("embed[align=top i]", IMG),
    ("embed[align=baseline i]", IMG), ("embed[align=texttop i]", IMG), ("embed[align=middle i]", IMG),
    ("embed[align=bottom i]", IMG), ("embed[hspace]", IMG), ("embed[vspace]", IMG),
    ("input[type=image i][border]", IMG), ("embed[width]", IMG), ("embed[height]", IMG),
]

# In html5.css through :where() and :is() selectors, which cost more to match: the same here for
# headings and lists outside article and section.
SIMPLER_RULES = [
    "h1, h2, h3, h4, h5, h6 { font-weight: bold; }",
    "ul ul, ol ul { list-style-type: circle; }",
    "ul ul ul, ul ol ul, ol ul ul, ol ol ul { list-style-type: square; }",
]

KINDLE_RULES = [
    "/* The Kindle: paragraphs indent 1em unless the book says otherwise, and the book's own body",
    "   margins don't add to the reader's. */",
    "p { text-indent: 1em; }",
    "body { margin: 0 !important; }",
]


def parse(text):
    """A stylesheet's top-level items, comments and @import left out: (selectors, declarations) for
    a rule, (condition, [rules]) for an @media block."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"@import[^;]*;", "", text)
    found, pos = [], 0
    while True:
        brace = text.find("{", pos)
        if brace < 0:
            return found
        head = " ".join(text[pos:brace].split())
        if head.startswith("@media"):
            depth, end = 1, brace + 1
            while depth:
                depth += {"{": 1, "}": -1}.get(text[end], 0)
                end += 1
            found.append((head, parse(text[brace + 1:end - 1])))
        else:
            end = text.index("}", brace) + 1
            selectors = [" ".join(s.split()) for s in split_selectors(head)]
            declarations = [" ".join(d.split()) for d in text[brace + 1:end - 1].split(";") if d.strip()]
            found.append((selectors, declarations))
        pos = end


def rules(path):
    return parse(open(path, encoding="utf-8").read())


def split_selectors(text):
    """Splits on the commas between selectors, not those inside :where(...) or :is(...)."""
    parts, depth, start = [], 0, 0
    for i, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif char == "," and depth == 0:
            parts.append(text[start:i])
            start = i + 1
    parts.append(text[start:])
    return [part for part in parts if part.strip()]


def rule_text(selectors, declarations):
    if isinstance(selectors, str):  # an @media block, kept whole: its rules apply only when it holds
        return selectors + " {\n" + "\n".join("  " + rule_text(*rule) for rule in declarations) + "\n}"
    return ", ".join(selectors) + " { " + "; ".join(declarations) + "; }"


def main():
    data = sys.argv[1]
    html5 = {}
    for selectors, declarations in rules(data + "/html5.css"):
        if isinstance(selectors, str):
            continue  # @media blocks: none of their rules are kept
        html5.setdefault(selectors[0], []).append((selectors, declarations))
    out = ["/* Built by scripts/kindle_css.py from KOReader's html5.css (the rules books use) and",
           "   epub.css, with the Kindle's own rules last. Edit the script, not this file. */"]
    for first, narrow in HTML5_RULES:
        if not html5.get(first):
            sys.exit(f"html5.css has no rule starting with {first!r}: KOReader's stylesheet changed")
        selectors, declarations = html5[first].pop(0)
        if narrow:
            selectors = [s for s in selectors if narrow(s)]
        if not selectors:
            sys.exit(f"nothing kept of html5.css's {first!r} rule")
        out.append(rule_text(selectors, declarations))
    out += SIMPLER_RULES
    out += [rule_text(selectors, declarations) for selectors, declarations in rules(data + "/epub.css")]
    out += KINDLE_RULES
    print("\n".join(out))


if __name__ == "__main__":
    main()
