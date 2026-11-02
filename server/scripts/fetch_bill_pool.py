"""Builds up the pool of bills that the daily bank draws from: server/data/bill-pool.json.gz.

Each run adds recent bills with recorded floor votes and an outcome (rules in fetch_state_bills.py) from
Open States, and keeps everything already in the pool. Needs OPENSTATES_API_KEY. The free key allows 250
requests a day, so responses are cached in server/.cache/ (never re-spent), and a run that hits the limit
just stops; run it again tomorrow to continue.

  python3 server/scripts/fetch_bill_pool.py [--pages N] [--want N] [ST ST ...]
  python3 server/scripts/fetch_bill_pool.py --targeted il:104th:2025-08-01:2 nj:221:2026-01-15:3

Sorting by latest action surfaces bills that simply died, so some states yield little. --targeted reads
ST:SESSION:DATE:PAGES instead: bills whose last action came after DATE, oldest first. A date just after a
legislature adjourns lands on the bills the governor signed.

Arkansas, Kansas, Massachusetts, New Hampshire and New Mexico publish no usable votes through Open
States. Their bills come from the legislatures' own sites, in server/data/bill-pool-official.json.
"""

import argparse
import gzip
import json
import os
import re
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_state_bills as fsb  # noqa: E402
from build_civic_data import DATA  # noqa: E402

POOL = os.path.join(DATA, "bill-pool.json.gz")
fsb.CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache", "openstates")
NOT_IN_OPEN_STATES = {"ar", "ks", "ma", "nh", "nm"}
OLDEST_SESSION = "2023-01-01"
# Bills that make no sense as a daily question: bare budget lines and bills about one named place.
DULL = re.compile(
    r"^(an act )?(making )?(an )?appropriations?\b|^appropriation bill|supplemental appropriation|\bbudget of\b|"
    r"\bfor the (city|town|village|county) of\b|\bin (the )?(city|town|village) of\b|\bcounty of\b.*\blocal\b",
    re.I,
)


def load():
    if os.path.exists(POOL):
        with gzip.open(POOL, "rt", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save(pool):
    with gzip.open(POOL, "wt", encoding="utf-8") as f:
        json.dump(pool, f, ensure_ascii=False, sort_keys=True)


def add_bills(entry, st, name, session, results):
    for b in results:
        if DULL.search(b["title"]) or re.search(r"\d+A$", b["identifier"]) and st == "ne":
            continue
        c = fsb.to_candidate(st, name, session, b)
        if c:
            entry["bills"].setdefault(c["id"], c)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=5, help="most pages (20 bills each) to read per state")
    ap.add_argument("--want", type=int, default=60, help="stop a state at this many pooled bills")
    ap.add_argument("--targeted", nargs="*", default=[])
    ap.add_argument("states", nargs="*")
    args = ap.parse_args()

    fsb.KEY = fsb.key()
    pool = load()
    wanted = {s.lower() for s in args.states}
    if args.targeted:
        names = {j["id"].split(":")[-1].split("/")[0]: j["name"] for j in fsb.jurisdictions()}
        for spec in args.targeted:
            st, session, since, count = spec.split(":")
            entry = pool.setdefault(st.upper(), {"stateName": names[st], "unicameral": st in ("ne", "dc"), "bills": {}})
            try:
                for page in range(1, int(count) + 1):
                    res = fsb.api("/bills", jurisdiction=st, session=session, sort="latest_action_asc", action_since=since, classification="bill",
                                  include=["votes", "abstracts", "actions", "sources"], per_page=20, page=page)
                    add_bills(entry, st, names[st], {"identifier": session}, res["results"])
            except urllib.error.HTTPError as err:
                save(pool)
                print(f"{st}: {err}; saved, run again later", flush=True)
                if err.code == 429:
                    return
                continue
            print(f"{st}: {len(entry['bills'])} bills", flush=True)
            save(pool)
        return
    for j in fsb.jurisdictions():
        st = j["id"].split(":")[-1].split("/")[0]
        if "territory" in j["id"] or st in NOT_IN_OPEN_STATES or (wanted and st not in wanted):
            continue
        entry = pool.setdefault(st.upper(), {"stateName": j["name"], "unicameral": st in ("ne", "dc"), "bills": {}})
        sessions = sorted((s for s in j["legislative_sessions"] if OLDEST_SESSION <= (s.get("start_date") or "") <= fsb.TODAY),
                          key=lambda s: s["start_date"], reverse=True)
        pages = 0
        try:
            for s in sessions:
                for page in range(1, args.pages + 1):
                    if pages >= args.pages or len(entry["bills"]) >= args.want:
                        break
                    res = fsb.api("/bills", jurisdiction=st, session=s["identifier"], sort="latest_action_desc", classification="bill",
                                  include=["votes", "abstracts", "actions", "sources"], per_page=20, page=page)
                    pages += 1
                    add_bills(entry, st, j["name"], s, res["results"])
                    if page >= res["pagination"]["max_page"]:
                        break
        except urllib.error.HTTPError as err:
            save(pool)
            print(f"{st}: {err}; saved, run again later", flush=True)
            if err.code == 429:
                return
            continue
        print(f"{st}: {len(entry['bills'])} bills after {pages} pages", flush=True)
        save(pool)
    print(f"{len(pool)} states, {sum(len(e['bills']) for e in pool.values())} bills")


if __name__ == "__main__":
    main()
