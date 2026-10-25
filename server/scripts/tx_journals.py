"""Member-level Texas Legislature votes on Docket's bills, read from the official House and Senate
journals (PDF, converted with pdftotext from poppler).

Each vote is the last recorded vote in that chamber: final passage, or concurring in the other
chamber's amendments. The parsed Yeas and Nays must add up to the tally the app shows, or the
build stops. When the journal records a vote without listing names (a unanimous Senate vote, or a
voice vote on the uncontested calendar), every senator present that day is counted as Yea: the
members named in that day's other roll calls, minus anyone listed as absent.
"""

import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request

HOUSE = "https://journals.house.texas.gov/hjrnl"
SENATE = "https://journals.senate.texas.gov/sjrnl"

# bill_id, chamber, journal day, anchor (House: record vote number; Senate: text near the vote), yeas, nays
VOTES = [
    ("tx-89r-hb1481", "house", "89r/DAY49", "Record 470", 128, 17),
    ("tx-89r-hb1481", "senate", "89r/05-25", r"HOUSE BILL 1481 ON THIRD READING", 31, 0),
    ("tx-89r-sb3", "senate", "89r/05-25", r"concur in the House amendments to SB 3\.", 25, 6),
    ("tx-89r-sb3", "house", "89r/DAY70", "Record 3304", 87, 54),
    ("tx-89r-sb6", "senate", "89r/05-29", r"SENATE BILL 6 WITH HOUSE AMENDMENTS", 31, 0),
    ("tx-89r-sb6", "house", "89r/DAY75", "Record 3643", 103, 25),
    ("tx-892-hb4", "house", "892/DAY05", "Record 30", 88, 52),
    ("tx-892-hb4", "senate", "892/08-22", r"HOUSE BILL 4 ON THIRD READING", 18, 11),
    ("tx-89r-hb2", "senate", "89r/05-23", r"HOUSE BILL 2 ON THIRD READING", 31, 0),
    ("tx-89r-hb2", "house", "89r/DAY77", "Record 4015", 122, 13),
    ("tx-89r-sb2", "senate", "89r/04-24", r"moved to concur in the House amendments to SB 2\.", 19, 12),
    ("tx-89r-sb2", "house", "89r/DAY46", "Record 300", 86, 61),
    ("tx-89r-sb984", "senate", "89r/04-10", r"SB 984 \(Bettencourt\)", 30, 0),
    ("tx-89r-sb984", "house", "89r/DAY68", "Record 3009", 147, 0),
    ("tx-89r-sb1498", "senate", "89r/04-01", r"SENATE BILL 1498 ON THIRD READING", 26, 5),
    ("tx-89r-sb1498", "house", "89r/DAY71", "Record 3338", 74, 65),
]


def fold(s):
    """Lowercase, no accents, letters only: 'Leo-Wilson' and 'Leo Wilson' compare equal."""
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z]", "", s)


# Journal names whose initial doesn't match the roster's given name (a nickname).
ALIASES = {"J. Hinojosa": "Chuy Hinojosa"}


def pdf_text(url, cache):
    path = os.path.join(cache, re.sub(r"[^A-Za-z0-9.-]", "_", url.rsplit("/", 1)[-1]))
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "docket-hackathon/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                data = res.read()
        except urllib.error.HTTPError:
            return None
        if not data.startswith(b"%PDF"):
            return None
        with open(path, "wb") as f:
            f.write(data)
    out = subprocess.run(["pdftotext", "-enc", "UTF-8", path, "-"], capture_output=True, check=True).stdout.decode()
    # These PDFs draw some spaces with a glyph that extracts as "i" ("HBi1481", "Yeas:iiAlders").
    out = out.replace("ii", " ")
    out = re.sub(r"(?<=[A-Za-z.,:)])i(?=[\dA-Z(])", " ", out)
    # A senator's initial at the end of a line ("A.⏎Hinojosa") would otherwise end the list early.
    return re.sub(r"(?<=[ ,:])([A-Z])\.\s*\n\s*(?=[A-Z][a-z])", r"\1. ", out)


def journal(day, chamber, cache):
    session, d = day.split("/")
    if chamber == "house":
        prefix = "89C2" if session == "892" else "89R"
        return pdf_text(f"{HOUSE}/{session}/pdf/{prefix}{d}FINAL.PDF", cache), f"{HOUSE}/{session}/pdf/{prefix}{d}FINAL.PDF"
    prefix = "89S2SJ" if session == "892" else "89RSJ"
    parts, urls = [], []
    for suffix in ("F", "F1", "F2", "F3"):
        url = f"{SENATE}/{session}/pdf/{prefix}{d}-{suffix}.PDF"
        text = pdf_text(url, cache)
        if text is None:
            break
        parts.append(text)
        urls.append(url)
    return "\n".join(parts), urls[0]


def split_names(block, sep):
    block = re.sub(r"\s+", " ", block)
    # Drop page furniture that lands inside a long list.
    block = re.sub(
        r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \w+ \d+, \d{4}|SENATE JOURNAL|HOUSE JOURNAL"
        r"|\d+(st|nd|rd|th) (Day|DAY)|89th (Legislature|LEGISLATURE) — [A-Z][a-zA-Z]+ [A-Z][a-zA-Z]+|\b\d{1,4}\b",
        " ",
        block,
    )
    return [n.strip(" .—") for n in block.split(sep) if n.strip(" .—")]


def house_vote(text, anchor, yeas, nays):
    m = re.search(rf"\({anchor}\):\s*(\d+) Yeas, (\d+) Nays", text)
    if not m:
        sys.exit(f"House journal: no '{anchor}'")
    if (int(m.group(1)), int(m.group(2))) != (yeas, nays):
        sys.exit(f"House {anchor}: journal says {m.group(1)}-{m.group(2)}, expected {yeas}-{nays}")
    rest = text[m.end():]
    rest = rest[rest.find("Yeas —"):] if "Yeas —" in rest[:400] else rest
    end = re.search(r"\n\s*(Present, not voting|Absent|STATEMENTS? OF VOTE|\w[^\n]{0,60}\(Record \d+\))", rest)
    rest = rest[: end.start() if end else 4000]
    lists = {}
    for label, body in re.findall(r"(Yeas|Nays) — (.*?)(?=(?:Yeas|Nays) —|$)", rest, re.S):
        lists[label] = split_names(body, ";")
    return lists.get("Yeas", []), lists.get("Nays", [])


def senate_roster(text):
    """Senators named in any of the day's roll calls, and those listed as absent."""
    named = set()
    for body in re.findall(r"(?:Yeas|Nays|Present-not voting): (.*?)(?=\n(?:Yeas|Nays|Absent|Present)|\.\n)", text, re.S):
        named.update(split_names(body, ","))
    absent = set()
    for body in re.findall(r"Absent(?:-excused)?: (.*?)\.", text):
        absent.update(split_names(body, ","))
    return named, absent


def senate_vote(text, anchor, yeas, nays):
    a = re.search(anchor, text)
    if not a:
        sys.exit(f"Senate journal: no '{anchor}'")
    seg = text[a.start():]
    m = re.search(rf"(?:Yeas {yeas}, Nays {nays}|\({yeas}-{nays}\))", seg)
    if not m or m.start() > 400000:
        sys.exit(f"Senate '{anchor}': no {yeas}-{nays} vote")
    after = seg[m.end():m.end() + 3000]
    y = re.match(r"\.?\s*Yeas: (.*?)(?:\.\s*\n|\.\s*Nays)", after, re.S)
    if y:
        nay_m = re.search(r"Nays: (.*?)\.\s*\n", after, re.S)
        return split_names(y.group(1), ","), split_names(nay_m.group(1), ",") if nay_m else [], None
    if nays:
        sys.exit(f"Senate '{anchor}': {yeas}-{nays} vote lists no names")
    named, absent = senate_roster(text)
    present = sorted(named - absent)
    if len(present) != yeas:
        sys.exit(f"Senate '{anchor}': {len(present)} senators present that day, expected {yeas}")
    return present, [], "unanimous"


def match(name, members, chamber):
    """Journal name -> lawmaker id. House lists 'Bell, C.'; Senate lists 'A. Hinojosa'."""
    if name.startswith("Mr. Speaker"):
        name = "Burrows"  # the Speaker votes as "Mr. Speaker(C)"
    if name in ALIASES:
        return next((m["id"] for m in members if m["name"] == ALIASES[name]), None)
    initial = None
    if chamber == "house" and re.search(r", \w\.?$", name):
        name, initial = name.rsplit(", ", 1)
    elif chamber == "senate" and re.match(r"^\w\. ", name):
        initial, name = name.split(" ", 1)
    last = fold(name)
    hits = [m for m in members if fold(m["family_name"]) == last]
    if initial:
        hits = [m for m in hits if fold(m["given_name"]).startswith(fold(initial[0])) or fold(m["name"]).startswith(fold(initial[0]))]
    return hits[0]["id"] if len(hits) == 1 else None


def journal_votes(members_by_chamber):
    """Returns (votes, report). members_by_chamber: {'house': [...], 'senate': [...]} OpenStates rows."""
    cache = os.path.join(tempfile.gettempdir(), "docket-tx-journals")
    os.makedirs(cache, exist_ok=True)
    votes, report = [], []
    for bill_id, chamber, day, anchor, yeas, nays in VOTES:
        text, url = journal(day, chamber, cache)
        if chamber == "house":
            y, n = house_vote(text, anchor, yeas, nays)
            how = None
        else:
            y, n, how = senate_vote(text, anchor, yeas, nays)
        if (len(y), len(n)) != (yeas, nays):
            sys.exit(f"{bill_id} {chamber}: parsed {len(y)}-{len(n)} names, expected {yeas}-{nays}\nYeas: {y}\nNays: {n}")
        unmatched = []
        for names, vote in ((y, "yea"), (n, "nay")):
            for name in names:
                lid = match(name, members_by_chamber[chamber], chamber)
                if lid:
                    votes.append({"lawmaker_id": lid, "bill_id": bill_id, "vote": vote, "source_url": url})
                else:
                    unmatched.append(name)
        report.append(f"{bill_id} {chamber} {yeas}-{nays}{' (' + how + ')' if how else ''}: {len(y) + len(n) - len(unmatched)} matched; not in office now: {', '.join(unmatched) or 'none'}")
    return votes, report
