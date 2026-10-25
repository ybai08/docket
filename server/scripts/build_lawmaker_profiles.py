"""Background, links, start year and committees for every lawmaker in server/data/lawmakers.json.gz.

Writes server/data/lawmaker-profiles.json.gz, which `npm run seed` loads into lawmaker_profiles.
Run after build_civic_data.py.

Sources, all public and keyless:
  Background   the lead of the lawmaker's English Wikipedia article (CC BY-SA 4.0, credited with a link).
               The article is found only by an exact identifier: congress-legislators' Wikipedia title for
               Congress, the Wikidata ID OpenStates records for state legislators, or a Wikipedia link in
               OpenStates' sources. Never by searching a name, so a namesake can't be picked up.
  Links        official site and contact form (congress-legislators), official pages (OpenStates),
               Wikipedia and Ballotpedia pages where they're known.
  Start year   congress-legislators terms: the first of the unbroken run of terms in the current chamber.
  Committees   congress-legislators committee membership (Congress only; no bulk source for states).
Campaign platforms have no public bulk source that doesn't need an API key, so none are stored.
"""

import csv
import gzip
import io
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_civic_data import DATA, OPENSTATES, get  # noqa: E402

CL = "https://unitedstates.github.io/congress-legislators"
CACHE = os.path.join(tempfile.gettempdir(), "docket-wikipedia")
WIKI = "https://en.wikipedia.org/wiki/"

# Abbreviations that end in a period without ending a sentence.
ABBR = re.compile(r"(?:\b[A-Z]|U\.S|Jr|Sr|Dr|St|Mr|Mrs|Ms|Gen|Lt|Col|Sgt|Rep|Sen|Gov|Inc|Co|No|Mt|Ft|Jan|Feb|Aug|Sept|Oct|Nov|Dec|ca|vs|e\.g|i\.e)\.$")


def sentences(text, n=3, limit=700):
    # The plain-text intro keeps the gaps where pronunciations and footnotes were cut out.
    text = re.sub(r"\(\s*[;,]?\s*\)", "", text)
    text = re.sub(r"\(\s*[;,]?\s*", "(", text)
    text = re.sub(r"\s+([,;.)])", r"\1", re.sub(r"\s+", " ", text))
    parts, buf = [], ""
    for piece in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(])", text.strip()):
        buf = f"{buf} {piece}".strip()
        if not ABBR.search(buf):
            parts.append(buf)
            buf = ""
    if buf:
        parts.append(buf)
    out = ""
    for s in parts[:n]:
        if out and len(out) + len(s) > limit:
            break
        out = f"{out} {s}".strip()
    return out


def wiki_title(url):
    if url and url.startswith(("https://en.wikipedia.org/wiki/", "http://en.wikipedia.org/wiki/")):
        return urllib.parse.unquote(url.split("/wiki/", 1)[1]).replace("_", " ")
    return None


def wikidata_titles(qids):
    """Wikidata ID -> English Wikipedia title, 50 IDs per request."""
    out, qids = {}, sorted(qids)
    for i in range(0, len(qids), 50):
        q = "|".join(qids[i:i + 50])
        res = json.loads(get_wiki(f"https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=enwiki&ids={q}"))
        for qid, ent in res.get("entities", {}).items():
            title = ent.get("sitelinks", {}).get("enwiki", {}).get("title")
            if title:
                out[qid] = title
    return out


def leads(titles):
    """Title -> {text, sourceName, sourceUrl} from the intro of each English Wikipedia article. Asks for
    20 articles per request, one request at a time, and skips disambiguation pages. Cached on disk."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "intros.json")
    cache = json.load(open(path)) if os.path.exists(path) else {}
    todo = sorted(t for t in titles if t not in cache)
    for i in range(0, len(todo), 20):
        batch = todo[i:i + 20]
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": "2", "redirects": "1", "maxlag": "5",
            "prop": "extracts|pageprops|info", "exintro": "1", "explaintext": "1", "exlimit": "20",
            "ppprop": "disambiguation", "inprop": "url", "titles": "|".join(batch),
        })
        for attempt in range(5):
            try:
                res = json.loads(get_wiki(f"https://en.wikipedia.org/w/api.php?{q}"))
                break
            except urllib.error.HTTPError as err:
                if err.code != 429 or attempt == 4:
                    raise
                time.sleep(int(err.headers.get("Retry-After") or 5))
        # Map each requested title through normalization and redirects to the page it landed on.
        hop = {n["from"]: n["to"] for n in res["query"].get("normalized", []) + res["query"].get("redirects", [])}
        pages = {pg["title"]: pg for pg in res["query"]["pages"]}
        for t in batch:
            end = t
            while end in hop:
                end = hop[end]
            pg = pages.get(end, {})
            ok = pg.get("extract") and "missing" not in pg and "disambiguation" not in pg.get("pageprops", {})
            cache[t] = {"extract": pg["extract"], "url": pg["fullurl"]} if ok else None
        time.sleep(0.2)
    with open(path, "w") as f:
        json.dump(cache, f)
    return {
        t: {"text": sentences(c["extract"]), "sourceName": "Wikipedia (CC BY-SA 4.0)", "sourceUrl": c["url"]}
        for t in titles if (c := cache.get(t))
    }


def get_wiki(url):
    # Wikimedia asks automated clients to say who they are.
    req = urllib.request.Request(url, headers={"User-Agent": "DocketHackTX/1.0 (https://docketapp.tech) python-urllib"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode("utf-8")


def first_year_in_chamber(terms):
    """Start year of the unbroken run of terms ending with the current one, in the current chamber."""
    kind, start = terms[-1]["type"], terms[-1]["start"]
    for prev in reversed(terms[:-1]):
        gap = (date.fromisoformat(start) - date.fromisoformat(prev["end"])).days
        if prev["type"] != kind or gap > 60:
            break
        start = prev["start"]
    return start[:4]


def congress():
    members = json.loads(get(f"{CL}/legislators-current.json"))
    names = {c["thomas_id"]: c["name"] for c in json.loads(get(f"{CL}/committees-current.json"))}
    seats = {}
    for cid, roster in json.loads(get(f"{CL}/committee-membership-current.json")).items():
        if cid not in names:  # subcommittees have longer IDs; keep full committees only
            continue
        for r in roster:
            if r.get("bioguide"):
                role = r.get("title")
                seats.setdefault(r["bioguide"], []).append(f"{names[cid]}{f' ({role})' if role else ''}")
    out = {}
    for m in members:
        bio, term = m["id"]["bioguide"], m["terms"][-1]
        links = [{"label": "Official website", "url": term["url"]}] if term.get("url") else []
        if term.get("contact_form"):
            links.append({"label": "Contact form", "url": term["contact_form"]})
        title = m["id"].get("wikipedia")
        if title:
            links.append({"label": "Wikipedia", "url": WIKI + urllib.parse.quote(title.replace(" ", "_"))})
        if m["id"].get("ballotpedia"):
            links.append({"label": "Ballotpedia", "url": "https://ballotpedia.org/" + urllib.parse.quote(m["id"]["ballotpedia"].replace(" ", "_"))})
        out[bio] = {
            "wiki": title,
            "in_office_since": first_year_in_chamber(m["terms"]),
            "committees": {
                "items": sorted(seats[bio]),
                "sourceName": "congress-legislators",
                "sourceUrl": "https://github.com/unitedstates/congress-legislators",
            } if seats.get(bio) else None,
            "links": links,
        }
    return out


def state():
    def fetch(st):
        try:
            return list(csv.DictReader(io.StringIO(get(f"https://data.openstates.org/people/current/{st}.csv"))))
        except Exception as err:
            print(f"  OpenStates {st}: {err}")
            return []

    with ThreadPoolExecutor(8) as pool:
        rows = [p for ps in pool.map(fetch, OPENSTATES) for p in ps]
    titles = wikidata_titles({p["wikidata"] for p in rows if re.fullmatch(r"Q\d+", p.get("wikidata") or "")})
    out = {}
    for p in rows:
        urls = [u for u in (p["links"] + ";" + p["sources"]).split(";") if u.startswith("http")]
        wiki = titles.get(p.get("wikidata") or "") or next((wiki_title(u) for u in urls if wiki_title(u)), None)
        links = []
        official = next((u for u in p["links"].split(";") if u.startswith("http") and "wikipedia.org" not in u and "ballotpedia.org" not in u), None)
        if official:
            links.append({"label": "Official page", "url": official})
        if wiki:
            links.append({"label": "Wikipedia", "url": WIKI + urllib.parse.quote(wiki.replace(" ", "_"))})
        ballot = next((u for u in urls if "ballotpedia.org/" in u), None)
        if ballot:
            links.append({"label": "Ballotpedia", "url": ballot})
        out[p["id"]] = {"wiki": wiki, "in_office_since": None, "committees": None, "links": links}
    return out


def main():
    with gzip.open(os.path.join(DATA, "lawmakers.json.gz"), "rt") as f:
        ids = {m["id"] for m in json.load(f)}
    found = {**congress(), **state()}
    found = {k: v for k, v in found.items() if k in ids}

    intros = leads({v["wiki"] for v in found.values() if v["wiki"]})

    profiles = []
    for lid, v in sorted(found.items()):
        profiles.append({
            "lawmaker_id": lid,
            "in_office_since": v["in_office_since"],
            "background": intros.get(v["wiki"]) if v["wiki"] else None,
            "committees": v["committees"],
            "links": v["links"],
        })
    with gzip.open(os.path.join(DATA, "lawmaker-profiles.json.gz"), "wt", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, sort_keys=True)
    bg = sum(1 for p in profiles if p["background"])
    print(f"{len(profiles)}/{len(ids)} lawmakers profiled, {bg} with a Wikipedia background, "
          f"{sum(1 for p in profiles if p['committees'])} with committees, {sum(1 for p in profiles if p['links'])} with links")


if __name__ == "__main__":
    main()
