"""Builds Docket's civic data for the whole country from public sources, once, into server/data/:

  lawmakers.json.gz      every member of Congress, every state legislator (50 states, DC, Puerto Rico),
                         and Austin's mayor and council, with party, district and photo
  lawmaker-votes.json    how they voted on Docket's bills
  zip-districts.json.gz  which state, county, city, and districts each U.S. ZIP code falls in
  ../media/photos/       a resized copy of every lawmaker's photo, served by the API (not committed)

Sources:
  Congress roster     unitedstates/congress-legislators, official portraits from unitedstates/images
  State legislatures  OpenStates current people, one file per state (photos from each legislature's site)
  Austin council      the City of Austin's council votes dataset, headshots from austintexas.gov
  Congress votes      Voteview member roll calls (senate.gov blocks scripted downloads)
  Austin votes        the City of Austin's council votes dataset (datahub.austintexas.gov, 3c89-i35a)
  Texas votes         the Texas House and Senate journals (see tx_journals.py; needs pdftotext)
  ZIP districts       Census 2020 ZCTA relationship files: 119th Congress, 2024 state legislative plans,
                      counties and places; Austin council districts from the city's boundary dataset
                      (w3v2-cj58), placed by each ZIP's center point from the 2020 Census Gazetteer.

Run: python3 server/scripts/build_civic_data.py   (macOS: uses sips to resize photos)
Then `npm run seed` in server/ loads it, and deploy.sh ships the photos.
"""

import csv
import gzip
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
from tx_journals import journal_votes  # noqa: E402

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
PHOTOS = os.path.join(os.path.dirname(__file__), "..", "media", "photos")
CENSUS = "https://www2.census.gov/geo/docs/maps-data/data"

# Final recorded vote in each chamber (Voteview rollnumber, official roll number, verified tally).
CONGRESS_VOTES = [
    ("us-119-s5", "S", 7, 7, 64, 35),
    ("us-119-s5", "H", 22, 23, 263, 156),
    ("us-119-s146", "H", 103, 104, 409, 2),  # Senate passed by unanimous consent: no member votes
    ("us-119-s331", "S", 127, 127, 84, 16),
    ("us-119-s331", "H", 165, 166, 321, 104),
    ("us-119-hr1", "S", 372, 372, 50, 50),  # the Vice President broke the tie
    ("us-119-hr1", "H", 189, 190, 218, 214),
]
AUSTIN_VOTES = [
    ("atx-c14-2026-0020", "260827_RG_098", 10, 1),
    ("atx-26-2163", "260827_RG_011", 10, 1),
    ("atx-26-2274", "260827_RG_004", 9, 2),
]

# Headshots from each member's page on austintexas.gov, used only where the page names that member.
# District 4's page names no one, so it has no photo. The mayor's page 404s; his photo is from Commons.
W = "https://austin.widen.net/content"
AUSTIN_PHOTOS = {
    "0": ("https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Watson_Groundbreaking_5.3.23_%28cropped%29.jpg/"
          "330px-Watson_Groundbreaking_5.3.23_%28cropped%29.jpg",
          "Photo by EmmaAtx, CC BY-SA 4.0, via Wikimedia Commons"),
    "1": (f"{W}/6ownj6z5sv/web/Austin%20District%201%20-%20Web_D1-Headshot.jpg?w=240", None),
    "2": (f"{W}/w8eqbih8y4/web/Austin%20District%202%20-%20Web_Vanessa-profiledetail.jpg?w=240", None),
    "3": (f"{W}/joekrymskc/web/Austin%20District%203%20-%20Web_jose-velasquez-profiledetail-opt.jpg?w=240", None),
    "5": (f"{W}/ewbmwfdwyj/web/Alter_Ryan_bio.jpg?w=240", None),
    "6": (f"{W}/r26pgbz6kn/web/Austin%20District%206%20-%20Web_krista-headshot-opt.jpg?w=240", None),
    "7": (f"{W}/bf26jpttmp/web/Austin%20District%207%20-%20Web_D7-profiledetail-opt.jpg?w=240", None),
    "8": (f"{W}/ldixhspulc/web/Austin%20District%208%20-%20Web_PJE-profiledetail-opt.png?w=240", None),
    "9": (f"{W}/yajrku9cxq/web/Austin%20District%209%20-%20Web_zo-profile-opt.jpg?w=240", None),
    "10": (f"{W}/opfnakk2tl/web/Austin%20District%2010%20-%20Web_Marc_HollyReed_1_656x584.jpg?w=240", None),
}

PARTY = {"Democrat": "D", "Democratic": "D", "Republican": "R", "Independent": "I", "100": "D", "200": "R", "328": "I"}

FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
    "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
    "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP",
    "72": "PR", "78": "VI",
}
OPENSTATES = [s.lower() for s in FIPS.values() if s not in ("AS", "GU", "MP", "VI")]


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": "docket-hackathon/1.0"})
    with urllib.request.urlopen(req, timeout=300) as res:
        body = res.read()
    return body if binary else body.decode("utf-8-sig")


def pipe_rows(url):
    return list(csv.DictReader(io.StringIO(get(url)), delimiter="|"))


def district_key(s):
    """'State House District Belknap 01', 'Belknap 1' -> 'belknap1'; 'Berkshire-Hampden-Franklin-Hampshire
    District' and 'Berkshire, Hampden, Franklin and Hampshire' -> the same key. Census and OpenStates name
    districts differently, so both sides go through this before matching."""
    s = (s or "").lower()
    # Census prefixes the district with a label that varies by state ('Delegate District 1', 'Legislative
    # (House) District 1', 'State Representative District 1'); what follows "district" is the district.
    m = re.search(r"\b(?:sub)?district\b(.+)$", s)
    if m and re.search(r"[a-z0-9]", m.group(1)):
        s = m.group(1)
    s = re.sub(r"state (house|senate) district|assembly district|senatorial district|(house|senate|legislative) district"
               r"|congressional district|district|ward|\band\b", " ", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return re.sub(r"(?<![0-9])0+(?=[0-9])", "", s)


# ---------- lawmakers ----------

def congress_members():
    out = []
    for m in json.loads(get("https://unitedstates.github.io/congress-legislators/legislators-current.json")):
        term = m["terms"][-1]
        bio = m["id"]["bioguide"]
        senate = term["type"] == "sen"
        district = None if senate else str(term["district"])
        out.append({
            "id": bio,
            "body": "us-senate" if senate else "us-house",
            "state": term["state"],
            "city": None,
            "name": m["name"].get("official_full") or f"{m['name']['first']} {m['name']['last']}",
            "title": "Senator" if senate else ("Representative" if term["state"] not in ("DC", "PR", "GU", "VI", "AS", "MP") else "Delegate"),
            "party": PARTY.get(term.get("party"), "I"),
            "district": district,
            "district_key": district,
            "photo_source": f"https://unitedstates.github.io/images/congress/225x275/{bio}.jpg",
            "photo_credit": None,
            "source_url": f"https://bioguide.congress.gov/search/bio/{bio}",
        })
    return out


def state_legislators():
    def fetch(st):
        try:
            return st, list(csv.DictReader(io.StringIO(get(f"https://data.openstates.org/people/current/{st}.csv"))))
        except Exception as err:  # a missing state shouldn't sink the build; it's reported below
            print(f"  OpenStates {st}: {err}")
            return st, []

    with ThreadPoolExecutor(8) as pool:
        people = dict(pool.map(fetch, OPENSTATES))
    out = []
    for st, rows in people.items():
        for p in rows:
            # One-chamber bodies (Nebraska's Legislature, the DC Council) sit in Census's "upper" file.
            upper = p["current_chamber"] in ("upper", "legislature")
            links = [l for l in p["links"].split(";") if l]
            out.append({
                "id": p["id"],
                "body": "state-upper" if upper else "state-lower",
                "state": st.upper(),
                "city": None,
                "name": p["name"],
                "title": ("Council Member" if st == "dc" else "State Senator") if upper else "State Representative",
                "party": PARTY.get(p["current_party"]),
                "district": p["current_district"],
                "district_key": district_key(p["current_district"]),
                "photo_source": p["image"] or None,
                "photo_credit": None,
                "source_url": links[0] if links else f"https://openstates.org/{st}/",
            })
    return out, people


def austin_council(rows):
    """Mayor and council from the latest vote in the council dataset, so names and seats are current."""
    out = {}
    for r in rows:
        d = r.get("voter_district") or "0"
        photo, credit = AUSTIN_PHOTOS.get(d, (None, None))
        out[r["voter_name"]] = {
            "id": "atx-mayor" if d == "0" else f"atx-d{d}",
            "body": "city-council",
            "state": "TX",
            "city": "Austin",
            "name": r["voter_name"],
            "title": r.get("voter_title") or ("Mayor" if d == "0" else "Council Member"),
            "party": None,  # Austin's city races are nonpartisan
            "district": None if d == "0" else d,
            "district_key": None if d == "0" else d,
            "photo_source": photo,
            "photo_credit": credit,
            "source_url": "https://www.austintexas.gov/" + ("department/mayor" if d == "0" else f"department/district-{d}"),
        }
    return out


# ---------- photos ----------

def store_photos(lawmakers):
    """Downloads each photo once and keeps a 240px JPEG copy; photo_url points at our own copy."""
    os.makedirs(PHOTOS, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="docket-photos-")

    def one(m):
        if not m["photo_source"]:
            return m, None
        name = re.sub(r"[^A-Za-z0-9-]", "", m["id"].rsplit("/", 1)[-1]) + ".jpg"
        dest = os.path.join(PHOTOS, name)
        if not os.path.exists(dest):
            try:
                raw = os.path.join(tmp, name + ".src")
                with open(raw, "wb") as f:
                    f.write(get(m["photo_source"], binary=True))
                subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "75", "-Z", "240", raw, "--out", dest],
                               capture_output=True, check=True, timeout=60)
            except Exception:
                return m, None
        return m, f"/photos/{name}"

    with ThreadPoolExecutor(24) as pool:
        for m, url in pool.map(one, lawmakers):
            m["photo_url"] = url
    return sum(1 for m in lawmakers if m["photo_url"])


# ---------- votes ----------

def vote_word(cast_code):
    code = int(float(cast_code))
    return "yea" if code in (1, 2, 3) else "nay" if code in (4, 5, 6) else None


def congress_votes(members):
    by_bioguide = {m["id"] for m in members}
    out = []
    for chamber in ("S", "H"):
        csv_ = lambda kind: list(csv.DictReader(io.StringIO(get(f"https://voteview.com/static/data/out/{kind}/{chamber}119_{kind}.csv"))))
        rolls = {int(r["rollnumber"]): r for r in csv_("rollcalls")}
        icpsr_to_bio = {m["icpsr"]: m["bioguide_id"] for m in csv_("members") if m["bioguide_id"] in by_bioguide}
        votes = csv_("votes")
        for bill_id, ch, roll, official, yeas, nays in CONGRESS_VOTES:
            if ch != chamber:
                continue
            rc = rolls[roll]
            if (int(rc["yea_count"]), int(rc["nay_count"])) != (yeas, nays) or int(rc["clerk_rollnumber"]) != official:
                sys.exit(f"{bill_id} {chamber} roll {roll}: tally {rc['yea_count']}-{rc['nay_count']} does not match {yeas}-{nays}")
            for v in votes:
                if int(v["rollnumber"]) == roll and v["icpsr"] in icpsr_to_bio and vote_word(v["cast_code"]):
                    out.append({
                        "lawmaker_id": icpsr_to_bio[v["icpsr"]],
                        "bill_id": bill_id,
                        "vote": vote_word(v["cast_code"]),
                        "source_url": f"https://voteview.com/rollcall/R{chamber}119{roll:04d}",
                    })
    return out


def austin_votes():
    rows_by_item, votes = {}, []
    for bill_id, item_id, yeas, nays in AUSTIN_VOTES:
        q = urllib.parse.urlencode({"item_id": item_id, "$limit": 50})
        rows = json.loads(get(f"https://datahub.austintexas.gov/resource/3c89-i35a.json?{q}"))
        y = sum(r["vote_cast"] == "Yes" for r in rows)
        n = sum(r["vote_cast"] == "No" for r in rows)
        if (y, n) != (yeas, nays):
            sys.exit(f"{bill_id}: Austin tally {y}-{n} does not match {yeas}-{nays}")
        rows_by_item[item_id] = rows
        for r in rows:
            if r["vote_cast"] in ("Yes", "No"):
                votes.append((bill_id, item_id, r))
    return rows_by_item, votes


# ---------- ZIP districts ----------

def zip_districts():
    rel = f"{CENSUS}/rel2020"
    points = {}  # ZCTA center points, from the Gazetteer
    with zipfile.ZipFile(io.BytesIO(get(f"{CENSUS}/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip", binary=True))) as z:
        for line in z.read(z.namelist()[0]).decode().splitlines()[1:]:
            f = [x.strip() for x in line.split("\t")]
            points[f[0]] = (float(f[6]), float(f[5]))  # lon, lat

    rows = []

    def add(kind, path, geoid_col, name_col, keep=lambda r: True, code=lambda g, n: g, name=lambda n: n):
        for r in pipe_rows(f"{rel}/{path}"):
            z = r["GEOID_ZCTA5_20"]
            total = int(r["AREALAND_ZCTA5_20"] or 0)
            if not z or not keep(r) or not total:
                continue
            share = int(r["AREALAND_PART"] or 0) / total
            state = FIPS.get(r[geoid_col][:2])
            if share < 0.005 or not state:  # slivers along a boundary
                continue
            rows.append({
                "zip": z, "state": state, "kind": kind, "code": code(r[geoid_col], r[name_col]),
                "name": name(r[name_col]), "share": round(min(share, 1), 4),
            })

    add("us-house", "cd-sld/tab20_cd11920_zcta520_natl.txt", "GEOID_CD119_20", "NAMELSAD_CD119_20",
        # 00 is an at-large seat and 98 a non-voting delegate's; both are district "0" in the roster.
        code=lambda g, n: ("0" if g[2:] == "98" else str(int(g[2:]))) if g[2:].isdigit() else district_key(n))
    add("state-upper", "cd-sld/tab20_sldu202420_zcta520_natl.txt", "GEOID_SLDU2024_20", "NAMELSAD_SLDU2024_20",
        code=lambda g, n: district_key(n))
    add("state-lower", "cd-sld/tab20_sldl202420_zcta520_natl.txt", "GEOID_SLDL2024_20", "NAMELSAD_SLDL2024_20",
        code=lambda g, n: district_key(n))
    add("county", "zcta520/tab20_zcta520_county20_natl.txt", "GEOID_COUNTY_20", "NAMELSAD_COUNTY_20")
    # Incorporated places only (G4110); census-designated places aren't cities.
    add("city", "zcta520/tab20_zcta520_place20_natl.txt", "GEOID_PLACE_20", "NAMELSAD_PLACE_20",
        keep=lambda r: r["MTFCC_PLACE_20"] == "G4110",
        name=lambda n: n.rsplit(" ", 1)[0] if n.rsplit(" ", 1)[-1] in ("city", "town", "village", "borough", "municipality") else n)

    # Austin council: the district containing the ZIP's center point, for ZIPs that overlap Austin.
    council = json.loads(get("https://datahub.austintexas.gov/resource/w3v2-cj58.geojson"))["features"]
    austin = {r["zip"] for r in rows if r["kind"] == "city" and r["code"] == "4805000"}
    for z in sorted(austin):
        lon, lat = points[z]
        for f in council:
            if in_multipolygon(lon, lat, f["geometry"]):
                d = f["properties"]["district_number"]
                rows.append({"zip": z, "state": "TX", "kind": "city-council", "code": d, "name": f"Council District {d}", "share": 1})
                break
    return rows


def in_ring(x, y, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def in_multipolygon(x, y, geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def align_seats(lawmakers, zips):
    """Some states elect several members per district and name the seats ('10A', '10B' in Idaho) while
    Census maps only the district ('10'). Point those seats at their district."""
    seats = {(r["state"], r["kind"], r["code"]) for r in zips if r["kind"] in ("state-upper", "state-lower")}
    for m in lawmakers:
        key = m["district_key"]
        if m["body"] in ("state-upper", "state-lower") and key and (m["state"], m["body"], key) not in seats:
            bare = re.sub(r"(?<=[0-9])[a-z]+$", "", key)
            if (m["state"], m["body"], bare) in seats:
                m["district_key"] = bare


def coverage(lawmakers, zips):
    """Per state: share of state legislative seats that a ZIP maps to. Low numbers mean the naming didn't line up."""
    seats = {(r["state"], r["kind"], r["code"]) for r in zips if r["kind"] in ("state-upper", "state-lower")}
    by_state = {}
    for m in lawmakers:
        if m["body"] in ("state-upper", "state-lower") and m["district_key"] not in ("atlarge", "chairman"):
            hit = (m["state"], m["body"], m["district_key"]) in seats
            t = by_state.setdefault(m["state"], [0, 0])
            t[0] += hit
            t[1] += 1
    low = {s: f"{h}/{n}" for s, (h, n) in sorted(by_state.items()) if h < n}
    total = sum(h for h, _ in by_state.values()), sum(n for _, n in by_state.values())
    return total, low


def main():
    congress = congress_members()
    legislators, people = state_legislators()
    rows_by_item, atx = austin_votes()
    council = austin_council(rows_by_item[AUSTIN_VOTES[-1][1]])

    votes = congress_votes(congress)
    for bill_id, item_id, r in atx:
        votes.append({
            "lawmaker_id": council[r["voter_name"]]["id"],
            "bill_id": bill_id,
            "vote": "yea" if r["vote_cast"] == "Yes" else "nay",
            "source_url": f"https://datahub.austintexas.gov/resource/3c89-i35a.json?item_id={item_id}",
        })
    tx = people["tx"]
    tx_votes, report = journal_votes({
        "house": [p for p in tx if p["current_chamber"] == "lower"],
        "senate": [p for p in tx if p["current_chamber"] == "upper"],
    })
    votes += tx_votes
    print("\n".join(report))

    lawmakers = congress + legislators + list(council.values())
    photos = store_photos(lawmakers)
    zips = zip_districts()
    align_seats(lawmakers, zips)

    os.makedirs(DATA, exist_ok=True)
    for name, data in (("lawmakers.json.gz", lawmakers), ("zip-districts.json.gz", zips)):
        with gzip.open(os.path.join(DATA, name), "wt", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, sort_keys=True)
    with open(os.path.join(DATA, "lawmaker-votes.json"), "w") as f:
        json.dump(votes, f, indent=0, ensure_ascii=False, sort_keys=True)

    (matched, total), low = coverage(lawmakers, zips)
    print(f"{len(congress)} in Congress, {len(legislators)} state legislators, {len(council)} Austin council")
    print(f"{photos}/{len(lawmakers)} photos stored, {len(votes)} member votes, {len({r['zip'] for r in zips})} ZIPs, {len(zips)} ZIP rows")
    print(f"state seats matched to ZIPs: {matched}/{total}; states with gaps: {low}")


if __name__ == "__main__":
    main()
