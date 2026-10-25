"""Recent bills with recorded floor votes for every state legislature (except Texas, which is curated
by hand from the journals), from the Open States API. Needs OPENSTATES_API_KEY in server/.env.

Writes server/data/state-bill-picks.json: for each state, the bills chosen for its daily set, with the
official title and abstract, each chamber's final floor vote, the outcome, and how every current
member voted. Plain-English titles and captions are written from these into state-content.json by
hand (see README), so nothing a player reads is generated from a guess.

A bill is kept only if:
  - it had a floor vote in each chamber (one for Nebraska and D.C.), and the last one in each chamber
    is used, like the Texas journal votes;
  - each of those votes has recorded Yea and Nay counts, and any named Yeas and Nays add up to them
    (states that publish only totals give no member votes);
  - it reached an outcome: signed, became law, vetoed, or failed a floor vote.
Responses are cached on disk, and requests are spaced out to stay inside the free API tier.
"""

import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_civic_data import DATA  # noqa: E402

API = "https://v3.openstates.org"
CACHE = os.path.join(tempfile.gettempdir(), "docket-openstates")
TODAY = "2026-10-25"
PAGES_PER_SESSION = 3


def key():
    env = os.path.join(os.path.dirname(__file__), "..", ".env")
    for line in open(env):
        if line.startswith("OPENSTATES_API_KEY="):
            return line.split("=", 1)[1].strip().strip("\"'")
    sys.exit("OPENSTATES_API_KEY is missing from server/.env")


def api(path, **q):
    os.makedirs(CACHE, exist_ok=True)
    url = API + path + "?" + urllib.parse.urlencode(q, doseq=True)
    cached = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9]+", "_", path + "?" + urllib.parse.urlencode(q, doseq=True))[:200] + ".json")
    if os.path.exists(cached):
        with open(cached) as f:
            return json.load(f)
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"X-API-KEY": KEY, "User-Agent": "DocketHackTX/1.0 (https://docketapp.tech)"})
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                data = json.load(res)
            break
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == 5:
                raise
            time.sleep(int(err.headers.get("Retry-After") or 30))
    time.sleep(1.2)
    with open(cached, "w") as f:
        json.dump(data, f)
    return data


def jurisdictions():
    out = []
    for page in (1, 2):
        res = api("/jurisdictions", classification="state", include="legislative_sessions", per_page=52, page=page)
        out += res["results"]
        if page >= res["pagination"]["max_page"]:
            break
    return out


# Tallies some states write into the motion or action text instead of the vote counts:
# "AYES: 21 NOES: 11" (Missouri), "Yeas 39 to Nays 0" and "152 YEAS to 0 NAYS" (Massachusetts),
# "Yea: 27 Nay: 12" and "Yea 74, Nay 47" (Kansas).
TALLY = [
    re.compile(r"\bAYES:\s*(\d+)\s*NOES:\s*(\d+)", re.I),
    re.compile(r"\bYeas?\s*:?\s*(\d+)\s*(?:to|,)?\s*Nays?\s*:?\s*(\d+)", re.I),
    re.compile(r"\b(\d+)\s*YEAS?\s*to\s*(\d+)\s*NAYS?", re.I),
]
# Committee steps that carry a tally but aren't floor votes.
COMMITTEE = re.compile(r"^(Reported|Voted Do Pass|Committee|Do Pass|Recommend)", re.I)
FLOOR = ("lower", "upper", "legislature")


def tally(text):
    for rx in TALLY:
        m = rx.search(text or "")
        if m:
            return int(m.group(1)), int(m.group(2))
    return None


def floor_votes(bill):
    """Chamber -> the last floor vote there. Uses recorded vote events; where a state gives only a
    tally in the text, that tally (without member votes). Named Yeas and Nays that don't add up to the
    counts mean bad data, and the bill is dropped."""
    out = {}
    for v in sorted(bill.get("votes") or [], key=lambda v: v["start_date"]):
        org = v["organization"]
        if org.get("classification") not in FLOOR:
            continue  # committee votes
        counts = {c["option"]: c["value"] for c in v["counts"]}
        if counts.get("yes") is None or counts.get("no") is None:
            t = tally(v["motion_text"])
            if not t:
                continue
            counts = {"yes": t[0], "no": t[1]}
        yeas = [x for x in v["votes"] if x["option"] == "yes"]
        nays = [x for x in v["votes"] if x["option"] == "no"]
        if (yeas or nays) and (len(yeas), len(nays)) != (counts["yes"], counts["no"]):
            return None
        out[org["classification"]] = {
            "chamber": org["name"],
            "yeas": counts["yes"],
            "nays": counts["no"],
            "date": v["start_date"][:10],
            "motion": v["motion_text"],
            "result": v["result"] if v.get("result") in ("pass", "fail") else ("pass" if counts["yes"] > counts["no"] else "fail"),
            "members": [{"id": (x.get("voter") or {}).get("id"), "vote": "yea" if x["option"] == "yes" else "nay"}
                        for x in yeas + nays if (x.get("voter") or {}).get("id")],
        }
    # Chambers with no vote event: the last floor action there that states a tally.
    from_events = set(out)
    for act in bill.get("actions") or []:
        org = (act.get("organization") or {}).get("classification")
        t = tally(act["description"])
        if org in FLOOR and org not in from_events and t and not COMMITTEE.search(act["description"]):
            out[org] = {
                "chamber": act["organization"]["name"],
                "yeas": t[0],
                "nays": t[1],
                "date": act["date"][:10],
                "motion": act["description"],
                "result": "pass" if t[0] > t[1] else "fail",
                "members": [],
            }
    return out or None


SIGNED = re.compile(r"signed by (the )?governor|approved by (the )?governor|public act|became law|chaptered|became effective without", re.I)
VETOED = re.compile(r"vetoed", re.I)


def outcome(bill, votes):
    kinds = [c for a in bill.get("actions") or [] for c in a["classification"]]
    text = " | ".join(a["description"] for a in bill.get("actions") or [])
    failed = [v for v in votes.values() if v["result"] == "fail"]
    if failed:
        return False, f"Failed in the {failed[-1]['chamber']}"
    if "veto-override-passage" in kinds or "became-law" in kinds or "executive-signature" in kinds:
        return True, "Signed into law" if "executive-signature" in kinds else "Became law"
    if "executive-veto" in kinds or VETOED.search(text):
        return True, "Vetoed by the governor"
    if SIGNED.search(text):
        return True, "Signed into law" if re.search(r"signed|approved", text, re.I) else "Became law"
    return None, None


def candidates(st, name, sessions, unicameral):
    out = []
    for s in sessions:
        for page in range(1, PAGES_PER_SESSION + 1):
            if len(out) >= 24:
                return out
            res = api("/bills", jurisdiction=st, session=s["identifier"], sort="latest_action_desc", classification="bill",
                      include=["votes", "abstracts", "actions", "sources"], per_page=20, page=page)
            for b in res["results"]:
                votes = floor_votes(b)
                if not votes:
                    continue
                passed, result = outcome(b, votes)
                if passed is None:
                    continue
                ordered = sorted(votes.values(), key=lambda v: v["date"])
                src = next((x["url"] for x in b.get("sources") or [] if x.get("url")), b["openstates_url"])
                out.append({
                    "id": f"{st.lower()}-{s['identifier'].lower()}-{re.sub(r'[^a-z0-9]', '', b['identifier'].lower())}",
                    "state": st.upper(),
                    "stateName": name,
                    "session": s["identifier"],
                    "year": ordered[-1]["date"][:4],
                    "number": b["identifier"],
                    "officialTitle": b["title"],
                    "abstract": (b.get("abstracts") or [{}])[0].get("abstract", "")[:900],
                    "subjects": b.get("subject") or [],
                    "originChamber": ordered[0]["chamber"],
                    "chamberVotes": [{k: v[k] for k in ("chamber", "yeas", "nays", "date", "motion")} for v in ordered],
                    "floor": {k: {"chamber": v["chamber"], "yeas": v["yeas"], "nays": v["nays"]} for k, v in votes.items()},
                    "passed": passed,
                    "outcome": result,
                    "sourceUrl": src,
                    "openstatesUrl": b["openstates_url"],
                    "memberVotes": [m for v in ordered for m in v["members"]],
                })
            if page >= res["pagination"]["max_page"]:
                break
    return out


def margin(c, chamber):
    v = c["floor"].get(chamber)
    return v["yeas"] - v["nays"] if v else None


def landslide(pool):
    """Four bills voted on in the same chamber, margins spread out and no ties. Uses the chamber with
    the most distinct margins; each item carries that chamber's vote as rankVote."""
    distinct = lambda ch: len({margin(c, ch) for c in pool if margin(c, ch) is not None})
    chamber = max(("lower", "upper", "legislature"), key=distinct)
    if distinct(chamber) < 4:
        return []
    by_margin = sorted([c for c in pool if margin(c, chamber) is not None], key=lambda c: margin(c, chamber))
    chosen, margins = [], set()
    for q in (0, len(by_margin) // 3, 2 * len(by_margin) // 3, len(by_margin) - 1):
        for c in by_margin[q:] + by_margin[:q][::-1]:
            if margin(c, chamber) not in margins and c not in chosen:
                chosen.append(c)
                margins.add(margin(c, chamber))
                break
    return [{**c, "rankVote": c["floor"][chamber]} for c in chosen] if len(chosen) == 4 else []


def pick(cands):
    """3 for Roll Call (closest votes first), 4 for Landslide (one chamber's margins spread out, no
    ties), 4 for Filed or Fake (the rest). Each bill is used once."""
    seen = set()
    pool = [c for c in cands if c["id"] not in seen and not seen.add(c["id"])]
    closeness = lambda c: min(abs(v["yeas"] - v["nays"]) / max(1, v["yeas"] + v["nays"]) for v in c["chamberVotes"])
    rc = sorted(pool, key=lambda c: (not c["abstract"], closeness(c)))[:3]
    rest = [c for c in pool if c not in rc]
    ls = landslide(rest)
    ids = {c["id"] for c in ls}
    rest = [c for c in rest if c["id"] not in ids]
    return {"roll-call": rc, "landslide": ls, "filed-or-fake": rest[:4]}


def main():
    global KEY
    KEY = key()
    picks, report = {}, []
    for j in jurisdictions():
        st = j["id"].split(":")[-1].split("/")[0]
        if st == "tx" or "territory" in j["id"] and st != "pr":
            continue
        sessions = sorted((s for s in j["legislative_sessions"] if (s.get("start_date") or "9999") <= TODAY),
                          key=lambda s: s["start_date"], reverse=True)[:4]
        if not sessions:
            report.append(f"{st}: no sessions")
            continue
        unicameral = st in ("ne", "dc")
        try:
            cands = candidates(st, j["name"], sessions, unicameral)
        except urllib.error.HTTPError as err:
            report.append(f"{st}: HTTP {err.code}")
            continue
        chosen = pick(cands)
        picks[st.upper()] = {"stateName": j["name"], "unicameral": unicameral, **chosen}
        report.append(f"{st}: {len(cands)} candidates; " + ", ".join(f"{k} {len(v)}" for k, v in chosen.items()))
        print(report[-1], flush=True)
    with open(os.path.join(DATA, "state-bill-picks.json"), "w") as f:
        json.dump(picks, f, indent=1, ensure_ascii=False)
    print(f"{len(picks)} states written")


if __name__ == "__main__":
    main()
