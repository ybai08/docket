"""Builds Docket's civic data from public sources, once, into server/data/*.json:

  lawmakers.json       every Texas member of Congress, every Texas legislator, Austin's mayor and council
  lawmaker-votes.json  how they voted on Docket's bills
  zip-districts.json   which county, city, and districts each Texas ZIP code falls in

Sources:
  Congress roster     unitedstates/congress-legislators (theunitedstates.io), photos from unitedstates/images
  Texas Legislature   OpenStates current people for Texas (photos from house.texas.gov / senate.texas.gov)
  Austin council      the City of Austin's council votes dataset, headshots from austintexas.gov
  Congress votes      Voteview member roll calls (senate.gov blocks scripted downloads)
  Austin votes        the City of Austin's council votes dataset (datahub.austintexas.gov, 3c89-i35a)
  ZIP districts       Census 2020 ZCTA relationship files: 119th Congress, 2024 state legislative plans,
                      counties and places; Austin council districts from the city's boundary dataset
                      (w3v2-cj58), placed by each ZIP's center point from the 2020 Census Gazetteer.

Run: python3 -I server/scripts/build_civic_data.py   (then `npm run seed` in server/ loads it)
Texas Legislature member votes aren't machine-readable yet, so Texas legislators have no votes.
"""

import csv
import io
import json
import os
import sys
import urllib.parse
import urllib.request
import zipfile

DATA = os.path.join(os.path.dirname(__file__), "..", "data")
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


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": "docket-hackathon/1.0"})
    with urllib.request.urlopen(req, timeout=300) as res:
        body = res.read()
    return body if binary else body.decode("utf-8-sig")


def pipe_rows(url):
    return list(csv.DictReader(io.StringIO(get(url)), delimiter="|"))


# ---------- lawmakers ----------

def congress_members():
    out = []
    for m in json.loads(get("https://unitedstates.github.io/congress-legislators/legislators-current.json")):
        term = m["terms"][-1]
        if term["state"] != "TX":
            continue
        bio = m["id"]["bioguide"]
        senate = term["type"] == "sen"
        out.append({
            "id": bio,
            "body": "us-senate" if senate else "us-house",
            "name": m["name"].get("official_full") or f"{m['name']['first']} {m['name']['last']}",
            "title": "Senator" if senate else "Representative",
            "party": PARTY.get(term.get("party"), "I"),
            "district": None if senate else str(term["district"]),
            "photo_url": f"https://unitedstates.github.io/images/congress/225x275/{bio}.jpg",
            "photo_credit": None,
            "source_url": f"https://bioguide.congress.gov/search/bio/{bio}",
        })
    return out


def texas_legislators():
    out = []
    for p in csv.DictReader(io.StringIO(get("https://data.openstates.org/people/current/tx.csv"))):
        upper = p["current_chamber"] == "upper"
        links = [l for l in p["links"].split(";") if l]
        out.append({
            "id": p["id"],
            "body": "tx-senate" if upper else "tx-house",
            "name": p["name"],
            "title": "State Senator" if upper else "State Representative",
            "party": PARTY.get(p["current_party"], "I"),
            "district": p["current_district"],
            "photo_url": p["image"] or None,
            "photo_credit": None,
            "source_url": next((l for l in links if "texas.gov" in l), links[0] if links else "https://capitol.texas.gov"),
        })
    return out


def austin_council(rows):
    """Mayor and council from the latest vote in the council dataset, so names and seats are current."""
    out = {}
    for r in rows:
        d = r.get("voter_district") or "0"
        photo, credit = AUSTIN_PHOTOS.get(d, (None, None))
        out[r["voter_name"]] = {
            "id": "atx-mayor" if d == "0" else f"atx-d{d}",
            "body": "atx-council",
            "name": r["voter_name"],
            "title": r.get("voter_title") or ("Mayor" if d == "0" else "Council Member"),
            "party": None,  # Austin's city races are nonpartisan
            "district": None if d == "0" else d,
            "photo_url": photo,
            "photo_credit": credit,
            "source_url": "https://www.austintexas.gov/" + ("department/mayor" if d == "0" else f"department/district-{d}"),
        }
    return out


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
    tx_zips = set()

    def add(kind, path, geoid_col, name_col, keep=lambda r: True, code=lambda g: g, name=lambda n: n):
        for r in pipe_rows(f"{rel}/{path}"):
            z = r["GEOID_ZCTA5_20"]
            total = int(r["AREALAND_ZCTA5_20"] or 0)
            if not z or not keep(r) or not total:
                continue
            share = int(r["AREALAND_PART"] or 0) / total
            if share < 0.005:  # slivers along a boundary
                continue
            rows.append({"zip": z, "kind": kind, "code": code(r[geoid_col]), "name": name(r[name_col]), "share": round(min(share, 1), 4)})
            if kind == "us-house":
                tx_zips.add(z)

    add("us-house", "cd-sld/tab20_cd11920_zcta520_st48.txt", "GEOID_CD119_20", "NAMELSAD_CD119_20", code=lambda g: str(int(g[2:])))
    add("tx-senate", "cd-sld/tab20_sldu202420_zcta520_st48.txt", "GEOID_SLDU2024_20", "NAMELSAD_SLDU2024_20", code=lambda g: str(int(g[2:])))
    add("tx-house", "cd-sld/tab20_sldl202420_zcta520_st48.txt", "GEOID_SLDL2024_20", "NAMELSAD_SLDL2024_20", code=lambda g: str(int(g[2:])))
    add("county", "zcta520/tab20_zcta520_county20_natl.txt", "GEOID_COUNTY_20", "NAMELSAD_COUNTY_20",
        keep=lambda r: r["GEOID_COUNTY_20"].startswith("48"))
    # Incorporated places only (G4110); census-designated places aren't cities.
    add("city", "zcta520/tab20_zcta520_place20_natl.txt", "GEOID_PLACE_20", "NAMELSAD_PLACE_20",
        keep=lambda r: r["GEOID_PLACE_20"].startswith("48") and r["MTFCC_PLACE_20"] == "G4110",
        name=lambda n: n.rsplit(" ", 1)[0] if n.rsplit(" ", 1)[-1] in ("city", "town", "village") else n)

    # Austin council: the district containing the ZIP's center point, for ZIPs that overlap Austin.
    council = json.loads(get("https://datahub.austintexas.gov/resource/w3v2-cj58.geojson"))["features"]
    austin = {r["zip"] for r in rows if r["kind"] == "city" and r["code"] == "4805000"}
    for z in sorted(austin):
        lon, lat = points[z]
        for f in council:
            if in_multipolygon(lon, lat, f["geometry"]):
                d = f["properties"]["district_number"]
                rows.append({"zip": z, "kind": "atx-council", "code": d, "name": f"Council District {d}", "share": 1})
                break
    return [r for r in rows if r["zip"] in tx_zips]


def in_ring(x, y, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def in_multipolygon(x, y, geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def main():
    congress = congress_members()
    legislators = texas_legislators()
    rows_by_item, atx = austin_votes()
    latest = rows_by_item[AUSTIN_VOTES[-1][1]]
    council = austin_council(latest)

    votes = congress_votes(congress)
    for bill_id, item_id, r in atx:
        votes.append({
            "lawmaker_id": council[r["voter_name"]]["id"],
            "bill_id": bill_id,
            "vote": "yea" if r["vote_cast"] == "Yes" else "nay",
            "source_url": f"https://datahub.austintexas.gov/resource/3c89-i35a.json?item_id={item_id}",
        })

    lawmakers = congress + legislators + list(council.values())
    zips = zip_districts()

    os.makedirs(DATA, exist_ok=True)
    for name, data in (("lawmakers", lawmakers), ("lawmaker-votes", votes), ("zip-districts", zips)):
        with open(os.path.join(DATA, f"{name}.json"), "w") as f:
            json.dump(data, f, indent=0, ensure_ascii=False, sort_keys=True)
    kinds = {}
    for r in zips:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(f"{len(lawmakers)} lawmakers, {len(votes)} member votes, {len({r['zip'] for r in zips})} ZIPs {kinds}")


if __name__ == "__main__":
    main()
