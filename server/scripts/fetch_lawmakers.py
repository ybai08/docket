"""Builds server/data/lawmaker-votes.json: how each Texas member of Congress and each Austin council
member voted on Docket's bills, from public records.

  Congress: Voteview (UCLA) member-level roll calls, which mirror the House Clerk and Senate records.
            senate.gov blocks scripted downloads, so Voteview is the source for both chambers.
  Austin:   the City of Austin's council votes dataset (datahub.austintexas.gov, 3c89-i35a).

Run: python3 -I server/scripts/fetch_lawmakers.py
Texas Legislature member votes aren't in a machine-readable source, so they stay placeholders in the app.
"""

import csv
import io
import json
import os
import sys
import urllib.parse
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "lawmaker-votes.json")

# Final recorded vote in each chamber for each bill (Voteview rollnumber and the expected tally).
CONGRESS = [
    # bill_id, chamber, voteview rollnumber, clerk/senate number, yeas, nays
    ("us-119-s5", "S", 7, 7, 64, 35),
    ("us-119-s5", "H", 22, 23, 263, 156),
    ("us-119-s146", "H", 103, 104, 409, 2),  # Senate passed it by unanimous consent: no member votes
    ("us-119-s331", "S", 127, 127, 84, 16),
    ("us-119-s331", "H", 165, 166, 321, 104),
    ("us-119-hr1", "S", 372, 372, 50, 50),  # the Vice President broke the tie
    ("us-119-hr1", "H", 189, 190, 218, 214),
]

AUSTIN = [
    # bill_id, dataset item_id, yeas, nays
    ("atx-c14-2026-0020", "260827_RG_098", 10, 1),
    ("atx-26-2163", "260827_RG_011", 10, 1),
]

PARTY = {"100": "D", "200": "R", "328": "I"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "docket-hackathon/1.0"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return res.read().decode("utf-8")


def voteview(chamber, kind):
    return list(csv.DictReader(io.StringIO(get(f"https://voteview.com/static/data/out/{kind}/{chamber}119_{kind}.csv"))))


def vote_word(cast_code):
    code = int(float(cast_code))
    return "yea" if code in (1, 2, 3) else "nay" if code in (4, 5, 6) else None


def main():
    out = []
    for chamber in ("S", "H"):
        rolls = {int(r["rollnumber"]): r for r in voteview(chamber, "rollcalls")}
        members = {m["icpsr"]: m for m in voteview(chamber, "members") if m["state_abbrev"] == "TX"}
        votes = voteview(chamber, "votes")
        for bill_id, ch, roll, official, yeas, nays in CONGRESS:
            if ch != chamber:
                continue
            rc = rolls[roll]
            # Refuse to write anything that doesn't match the verified tally.
            if (int(rc["yea_count"]), int(rc["nay_count"])) != (yeas, nays) or int(rc["clerk_rollnumber"]) != official:
                sys.exit(f"{bill_id} {chamber} roll {roll}: tally {rc['yea_count']}-{rc['nay_count']} does not match {yeas}-{nays}")
            for v in votes:
                if int(v["rollnumber"]) != roll or v["icpsr"] not in members:
                    continue
                m = members[v["icpsr"]]
                word = vote_word(v["cast_code"])
                if not word:
                    continue
                out.append({
                    "billId": bill_id,
                    "body": "us-senate" if chamber == "S" else "us-house",
                    "memberId": m["bioguide_id"] or m["icpsr"],
                    "name": m["bioname"],
                    "party": PARTY.get(m["party_code"], "I"),
                    "district": None if chamber == "S" else str(int(float(m["district_code"]))),
                    "vote": word,
                    "source": f"https://voteview.com/rollcall/R{chamber}119{roll:04d}",
                })

    for bill_id, item_id, yeas, nays in AUSTIN:
        q = urllib.parse.urlencode({"item_id": item_id, "$limit": 50})
        rows = json.loads(get(f"https://datahub.austintexas.gov/resource/3c89-i35a.json?{q}"))
        y = sum(r["vote_cast"] == "Yes" for r in rows)
        n = sum(r["vote_cast"] == "No" for r in rows)
        if (y, n) != (yeas, nays):
            sys.exit(f"{bill_id}: Austin tally {y}-{n} does not match {yeas}-{nays}")
        for r in rows:
            if r["vote_cast"] not in ("Yes", "No"):
                continue
            out.append({
                "billId": bill_id,
                "body": "atx-council",
                "memberId": r["voter_name"],
                "name": r["voter_name"],
                "title": r.get("voter_title"),
                "party": None,  # Austin council races are nonpartisan
                "district": r.get("voter_district"),
                "vote": "yea" if r["vote_cast"] == "Yes" else "nay",
                "source": f"https://datahub.austintexas.gov/resource/3c89-i35a.json?item_id={item_id}",
            })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"wrote {len(out)} member votes to {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
