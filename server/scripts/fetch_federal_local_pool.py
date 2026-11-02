"""Congress and Austin bills for the daily bank: server/data/bill-pool-federal-local.json.gz.

Congress: passage votes from Voteview (with every member's vote), and titles, summaries and outcomes from
the official BILLSTATUS files on GovInfo. No key needed.
Austin: council votes from the city's open data, contested items first, every tally counted from the
named votes.

  python3 server/scripts/fetch_federal_local_pool.py
"""

import csv
import gzip
import io
import json
import os
import re
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_civic_data import DATA, get, vote_word  # noqa: E402

OUT = os.path.join(DATA, "bill-pool-federal-local.json.gz")
CONGRESS = 119
PASSAGE = re.compile(r"^(on passage|on motion to suspend the rules and pass|on motion to concur|on the conference report|on overriding the veto)", re.I)
TYPES = {"HR": ("H.R.", "house-bill"), "S": ("S.", "senate-bill"), "HJRES": ("H.J.Res.", "house-joint-resolution"), "SJRES": ("S.J.Res.", "senate-joint-resolution")}
ASKED = {"H": "U.S. House", "S": "U.S. Senate"}
SOCRATA = "https://datahub.austintexas.gov/resource/3c89-i35a.json"


def congress():
    bills = {}
    for ch in ("H", "S"):
        table = lambda kind: list(csv.DictReader(io.StringIO(get(f"https://voteview.com/static/data/out/{kind}/{ch}{CONGRESS}_{kind}.csv"))))
        icpsr = {m["icpsr"]: m["bioguide_id"] for m in table("members") if m["bioguide_id"]}
        votes = {}
        for v in table("votes"):
            votes.setdefault(int(v["rollnumber"]), []).append(v)
        for r in sorted(table("rollcalls"), key=lambda r: int(r["rollnumber"])):
            m = re.fullmatch(r"(HR|S|HJRES|SJRES)(\d+)", r["bill_number"] or "")
            if not m or not PASSAGE.search(r["vote_question"] or ""):
                continue
            roll = int(r["rollnumber"])
            # The last passage vote in a chamber wins, like the state bills.
            bills.setdefault((m.group(1), m.group(2)), {})[ch] = {
                "chamber": ASKED[ch], "yeas": int(r["yea_count"]), "nays": int(r["nay_count"]), "date": r["date"], "motion": r["vote_question"],
                "result": r["vote_result"] or "", "members": [
                    {"id": icpsr[v["icpsr"]], "vote": vote_word(v["cast_code"])}
                    for v in votes.get(roll, []) if v["icpsr"] in icpsr and vote_word(v["cast_code"])
                ],
            }
    out = {}
    for (kind, num), chambers in sorted(bills.items(), key=lambda kv: -len(kv[1])):
        lower = kind.lower()
        try:
            root = ET.fromstring(get(f"https://www.govinfo.gov/bulkdata/BILLSTATUS/{CONGRESS}/{lower}/BILLSTATUS-{CONGRESS}{lower}{num}.xml")).find("bill")
        except Exception as err:
            print(f"  {kind}{num}: {err}")
            continue
        time.sleep(0.3)
        latest = root.findtext("latestAction/text") or ""
        summaries = root.findall("summaries/summary")
        abstract = re.sub(r"<[^>]+>", " ", summaries[-1].findtext("text") or "") if summaries else ""
        ordered = sorted(chambers.items(), key=lambda kv: kv[1]["date"])
        failed = [v for _, v in ordered if re.search(r"fail|reject|defeat", v["result"], re.I) or v["yeas"] <= v["nays"]]
        if root.find("laws/item") is not None or re.search(r"became public law", latest, re.I):
            passed, outcome = True, "Signed into law"
        elif re.search(r"vetoed", latest, re.I):
            passed, outcome = True, "Vetoed by the president"
        elif failed and re.search(r"suspend", failed[-1]["motion"], re.I):
            continue  # suspension votes can fail with a majority, which would confuse a Yea/Nay count
        elif failed:
            passed, outcome = False, f"Failed in the {failed[-1]['chamber']}"
        else:
            passed, outcome = True, f"Passed the {ordered[-1][1]['chamber']}"
        label, slug = TYPES[kind]
        out[f"us-{CONGRESS}-{lower}{num}"] = {
            "id": f"us-{CONGRESS}-{lower}{num}", "state": "US", "stateName": "Congress", "session": str(CONGRESS),
            "year": ordered[-1][1]["date"][:4], "number": f"{label} {num}", "officialTitle": root.findtext("title") or "",
            "abstract": re.sub(r"\s+", " ", abstract).strip()[:900], "subjects": [root.findtext("policyArea/name") or ""],
            "originChamber": ordered[0][1]["chamber"],
            "chamberVotes": [{k: v[k] for k in ("chamber", "yeas", "nays", "date", "motion")} for _, v in ordered],
            "floor": {("lower" if c == "H" else "upper"): {"chamber": v["chamber"], "yeas": v["yeas"], "nays": v["nays"]} for c, v in ordered},
            "passed": passed, "outcome": outcome,
            "sourceUrl": f"https://www.congress.gov/bill/{CONGRESS}th-congress/{slug}/{num}", "openstatesUrl": f"https://www.congress.gov/bill/{CONGRESS}th-congress/{slug}/{num}",
            "memberVotes": [m for _, v in ordered for m in v["members"]],
        }
    return out


def austin(limit=30):
    q = urllib.parse.urlencode({
        "$select": "meeting_date,item_id,meeting_item_number,item_description,sum(case(vote_cast='No',1,true,0)) as noes,sum(case(vote_cast='Yes',1,true,0)) as yeas",
        "$group": "meeting_date,item_id,meeting_item_number,item_description", "$having": "noes >= 1", "$order": "meeting_date DESC", "$limit": limit * 2,
    })
    out = {}
    for it in json.loads(get(f"{SOCRATA}?{q}")):
        if len(out) >= limit or int(it["yeas"]) + int(it["noes"]) < 8 or re.match(r"conduct a public hearing", it["item_description"], re.I):
            continue
        rows = json.loads(get(f"{SOCRATA}?{urllib.parse.urlencode({'item_id': it['item_id'], '$limit': 50})}"))
        y = [r for r in rows if r["vote_cast"] == "Yes"]
        n = [r for r in rows if r["vote_cast"] == "No"]
        if (len(y), len(n)) != (int(it["yeas"]), int(it["noes"])):
            continue
        seat = lambda r: "atx-mayor" if "mayor" == (r.get("voter_title") or "").strip().lower() else f"atx-d{int(float(r['voter_district']))}"
        day = it["meeting_date"][:10]
        bid = f"atx-{it['item_id'].lower().replace('_', '-')}"
        out[bid] = {
            "id": bid, "state": "TX", "stateName": "Austin", "session": day[:4], "year": day[:4], "number": f"Item {it['meeting_item_number']}",
            "officialTitle": it["item_description"][:600], "abstract": "", "subjects": [], "originChamber": "Austin City Council",
            "chamberVotes": [{"chamber": "Austin City Council", "yeas": len(y), "nays": len(n), "date": day, "motion": rows[0].get("action_taken", "")}],
            "floor": {"legislature": {"chamber": "Austin City Council", "yeas": len(y), "nays": len(n)}},
            "passed": len(y) > len(n), "outcome": "Approved by the council" if len(y) > len(n) else "Failed in the council",
            "sourceUrl": f"{SOCRATA}?item_id={it['item_id']}", "openstatesUrl": f"{SOCRATA}?item_id={it['item_id']}",
            "memberVotes": [{"id": seat(r), "vote": "yea" if r["vote_cast"] == "Yes" else "nay"} for r in y + n if r.get("voter_district") or r.get("voter_title")],
        }
    return out


def main():
    pool = {"US": {"stateName": "Congress", "bills": congress()}, "ATX": {"stateName": "Austin", "bills": austin()}}
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump(pool, f, ensure_ascii=False, sort_keys=True)
    us = pool["US"]["bills"].values()
    print(f"Congress: {len(us)} bills, {sum(1 for c in us if c['outcome'] == 'Signed into law')} became law, {sum(1 for c in us if len(c['floor']) == 2)} with both chambers")
    print(f"Austin: {len(pool['ATX']['bills'])} contested items")


if __name__ == "__main__":
    main()
