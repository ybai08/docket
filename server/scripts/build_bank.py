"""The bank of future daily sets: server/data/bank.json.gz, which `npm run seed` loads. A new set goes live
each Central-time day with no server change.

  python3 server/scripts/build_bank.py --status            how many days are left, and thin states
  python3 server/scripts/build_bank.py --missing 14 OUT    bills that need plain-English text for 14 more days
  python3 server/scripts/build_bank.py --days 14           add 14 days after the last one

Days already in the bank never change, so a day someone played keeps its bills. How a day is built:

  Roll Call    Congress's 2 bills, plus the player's state's 3 (Texas 2, plus 1 from Austin in Austin).
               A player's vote is stored once per bill, so a Roll Call bill is never used twice.
  Filed or Fake  4 real captions and 4 fakes from the player's state.
  Landslide    4 bills from one chamber of the player's state, with different margins.

These two may reuse a bill from another day, least recently used first, but never one in that day's Roll
Call. A place with no state data (territories, or D.C.'s Landslide) gets the Congress version of the game.
A state with too few bills spreads them out evenly, so it has 1 or 2 Roll Call bills a day instead of 3.

Bills come from bill-pool*.json(.gz), state-bill-picks*, and their text from state-bill-text.json, written
only from each bill's official title and abstract.
"""

import argparse
import gzip
import json
import os
import random
import re
import sys
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_civic_data import DATA  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
BANK = os.path.join(DATA, "bank.json.gz")
TEXT = os.path.join(DATA, "state-bill-text.json")
EXTRA_DAYS_OF_FEDERAL = 10
TOPICS = {
    "Public schools", "Colleges and tuition", "Housing and property tax", "Criminal justice", "Guns",
    "Immigration and border", "Energy and the grid", "Water and environment", "Health care",
    "Elections and voting", "Tech and privacy", "Taxes and budget", "Arts and culture",
}

# Written by Docket, say nothing about any one state, and always stamped as fakes after the answer.
STATE_FAKES = [
    ("parking-poem", "Require every parking ticket written by state police to include a short poem."),
    ("dmv-music", "Require driver's license offices to play calming music while people wait."),
    ("capitol-flamingos", "Ban plastic lawn flamingos within 500 feet of the state capitol."),
    ("reply-all", "Fine state employees who hit reply-all on emails sent to more than 50 people."),
    ("capitol-naps", "Set aside a nap room in the state capitol for lawmakers during late-night sessions."),
    ("state-emoji", "Pick an official state emoji for government social media accounts."),
    ("squirrel-count", "Count the squirrels in every state park once every ten years."),
    ("umbrella-loans", "Start a free umbrella lending program at every state office building."),
    ("elevator-talk", "Ban small talk in state office building elevators during business hours."),
    ("pothole-names", "Let people pay to name a pothole on a state highway until it gets fixed."),
    ("plate-jokes", "Allow a joke in place of the slogan on standard state license plates."),
    ("capitol-mascot", "Hire a costumed mascot to greet visitors at the state capitol."),
    ("rest-stop-reviews", "Post customer star ratings at the entrance to every highway rest stop."),
    ("jury-snacks", "Require courts to serve jurors a hot breakfast on the first day of a trial."),
    ("library-silence", "Create a state inspector to measure noise levels in public libraries."),
    ("license-selfie", "Let drivers replace their license photo with a selfie once a year."),
    ("lawmaker-karaoke", "Hold a yearly karaoke contest between the two chambers of the legislature."),
    ("park-hammock", "Issue a permit for hanging a hammock between two trees in a state park."),
    ("toll-tips", "Add an optional tip for workers at state highway toll booths."),
    ("school-bell", "Replace the school bell with a song chosen by each graduating class."),
    ("voter-sticker", "Hold a statewide contest each year to design the \"I Voted\" sticker."),
    ("capitol-goats", "Use a herd of goats to trim the grass on the state capitol lawn."),
    ("snow-day-lottery", "Choose one surprise day off for state workers each year by lottery."),
    ("hearing-timer", "Cut off lawmakers' microphones after two minutes at committee hearings."),
    ("state-sandwich", "Name an official state sandwich and serve it in the capitol cafeteria."),
    ("ferry-whistle", "Require every state ferry to sound a whistle at noon."),
    ("agency-mottos", "Require every state agency to adopt a motto of five words or fewer."),
    ("highway-haiku", "Display a haiku by a resident on electronic highway signs each month."),
    ("clerk-robes", "Require county clerks to wear robes while recording deeds."),
    ("bird-of-the-month", "Name a state bird of the month, chosen by a vote of fourth graders."),
    ("meeting-stand", "Require state agency meetings over 30 minutes to be held standing up."),
    ("dmv-numbers", "Replace numbers with animal names in driver's license office waiting lines."),
    ("mail-scent", "Ban scented paper in official mail sent by state agencies."),
    ("rain-gauge", "Put a public rain gauge outside every county courthouse."),
    ("lawmaker-garden", "Require each lawmaker to tend one vegetable bed on the capitol grounds."),
    ("campground-curfew", "Set a statewide bedtime of 9 p.m. for guitars at public campgrounds."),
    ("fair-judges", "License pie judges at county fairs, with a yearly written exam."),
    ("drawbridge-horn", "Set one required horn pitch for all state drawbridges."),
    ("official-nap", "Declare the third Friday in March an official state nap day."),
    ("courthouse-cats", "Allow every county courthouse to keep one official cat."),
    ("license-riddle", "Add a riddle to the state driving test, for extra credit."),
    ("bench-plaques", "Require a plaque naming a local joke writer on every state park bench."),
    ("state-font", "Adopt an official state font for all government forms."),
    ("sign-rhymes", "Require new state road safety signs to rhyme."),
    ("lobby-pianos", "Place a public piano in the lobby of every state office building."),
    ("hunting-whistle", "Require a license to whistle at wild turkeys during hunting season."),
    ("budget-comic", "Publish the state budget summary as a comic book each year."),
    ("recess-lawmakers", "Give lawmakers a mandatory 20-minute recess outside during session."),
    ("mile-marker-trivia", "Print a trivia question on every tenth mile marker."),
    ("park-ranger-hats", "Set one required hat brim width for state park rangers."),
    ("legislature-roll-call-song", "Open each legislative session with a sing-along of the state song."),
    ("library-card-art", "Let residents submit their own artwork for public library cards."),
    ("tax-form-joke", "Print one approved joke on the back page of state tax forms."),
    ("snowplow-names", "Let schoolchildren name every state snowplow."),
    ("courtroom-clock", "Require courtrooms to display a countdown clock during closing arguments."),
    ("ice-cream-truck", "Set a statewide approved song list for ice cream trucks."),
    ("county-flag-contest", "Require every county to replace its flag through a public drawing contest."),
    ("capitol-tour-quiz", "Require a short quiz at the end of state capitol tours."),
    ("rest-area-yoga", "Add a marked yoga area at every highway rest stop."),
    ("trail-steps-signs", "Post a sign every hundred steps on hiking trails in state parks."),
]
FEDERAL_FAKES = [
    ("national-sandwich", "Name an official national sandwich and serve it in the Capitol cafeteria."),
    ("senate-karaoke", "Hold a yearly karaoke contest between the House and the Senate."),
    ("passport-selfie", "Let travelers replace their passport photo with a selfie once a year."),
    ("capitol-goats", "Use a herd of goats to trim the grass on the U.S. Capitol lawn."),
    ("national-nap", "Declare the third Friday in March a national nap day."),
    ("mail-stickers", "Let post offices hand out a free sticker with every package."),
    ("floor-timer", "Cut off members' microphones after two minutes during floor speeches."),
    ("tax-form-joke", "Print one approved joke on the back page of federal tax forms."),
    ("federal-font", "Adopt one official font for all federal agency forms."),
    ("park-hammock", "Require a federal permit for hanging a hammock in a national park."),
    ("capitol-mascot", "Hire a costumed mascot to greet visitors at the U.S. Capitol."),
    ("budget-comic", "Publish the federal budget summary as a comic book each year."),
    ("reply-all", "Fine federal employees who hit reply-all on emails to more than 50 people."),
    ("bald-eagle-census", "Have the Postal Service count bald eagles along mail routes."),
    ("airport-naps", "Require a free nap room at every major airport."),
    ("stamp-contest", "Let schoolchildren vote on the design of every new postage stamp."),
    ("recess-congress", "Give members of Congress a mandatory 20-minute recess outside each day."),
    ("agency-mottos", "Require every federal agency to adopt a motto of five words or fewer."),
    ("monument-wifi", "Require free Wi-Fi at every national monument."),
    ("anthem-length", "Set a time limit of 90 seconds for singing the national anthem at events."),
    ("census-pets", "Add a question about household pets to the next census."),
    ("capitol-pianos", "Place a public piano in every House office building."),
    ("space-flag", "Require a flag design contest for the first town on the moon."),
    ("mint-coin-jokes", "Have the U.S. Mint print a riddle on the back of the quarter."),
]

OUTCOME = {
    "Signed into law": "passed and was signed into law",
    "Became law": "passed and became law",
    "Vetoed by the governor": "passed but was vetoed by the governor",
    "Vetoed by the president": "passed but was vetoed by the president",
}


def central_today():
    return datetime.now(ZoneInfo("America/Chicago")).date()


def read_json(path):
    if not os.path.exists(path):
        return None
    if path.endswith(".gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    with open(path) as f:
        return json.load(f)


def curated_ids():
    """Bills hand-written in src/data, with their own text and votes; the pool never overwrites them."""
    with open(os.path.join(ROOT, "src", "data", "bills.ts")) as f:
        return set(re.findall(r"^  '([a-z0-9-]+)': \{", f.read(), re.M))


def load_pool():
    """Scope -> {stateName, bills: {id: bill}}, from every source."""
    pool = {}

    def add(st, name, bills):
        entry = pool.setdefault(st, {"stateName": name, "bills": {}})
        for c in bills:
            entry["bills"].setdefault(c["id"], c)

    for path in ("bill-pool.json.gz", "bill-pool-official.json", "bill-pool-federal-local.json.gz"):
        for st, e in (read_json(os.path.join(DATA, path)) or {}).items():
            add(st, e["stateName"], e["bills"].values())
    for path in ("state-bill-picks.json.gz", "state-bill-picks-extra.json"):
        for st, p in (read_json(os.path.join(DATA, path)) or {}).items():
            add(st, p["stateName"], [c for g in ("roll-call", "landslide", "filed-or-fake") for c in p[g]])
    pool.pop("PR", None)  # Puerto Rico's bill titles are in Spanish; it plays the Congress set for now
    curated = curated_ids()
    used = used_on_earlier_days()
    for e in pool.values():
        # Sources name sessions differently, so one bill can arrive under two ids. Same number and same
        # year of its last vote means the same bill; an id already asked or in the bank wins.
        banked = {i for d in (read_json(BANK) or {"days": {}})["days"].values() for s in d.values() for i in s.get("rollCall", [])}
        order = sorted(e["bills"].values(), key=lambda c: (c["id"] not in used and c["id"] not in banked, c["id"]))
        kept = {}
        for c in order:
            kept.setdefault((re.sub(r"\W", "", c["number"]).lower(), c["year"]), c)
        e["bills"] = {c["id"]: c for c in kept.values() if c["id"] not in curated}
    return pool


def used_on_earlier_days():
    """Roll Call bills already asked on the hand-seeded days and in the state content."""
    used = set()
    content = read_json(os.path.join(DATA, "state-content.json.gz")) or {"sets": {}}
    for s in content["sets"].values():
        used.update(s["rollCall"])
    return used


def closeness(c):
    return min(abs(v["yeas"] - v["nays"]) / max(1, v["yeas"] + v["nays"]) for v in c["chamberVotes"])


def clear_enough(c):
    return bool(c.get("abstract")) or len(c["officialTitle"]) >= 40


def one_place(c):
    """A bill about a single fire department or town: real, but a weak daily question."""
    return bool(re.search(r"\bfire (department|district|company)\b|\bin the (city|town)\b|\b(city|town|village) of\b", c["officialTitle"], re.I))


def rank(bills, seed):
    """Most playable first: clear titles, then close votes, with ties shuffled."""
    rng = random.Random(seed)
    bills = list(bills)
    rng.shuffle(bills)
    return sorted(bills, key=lambda c: (one_place(c), not clear_enough(c), round(closeness(c), 1)))


def rc_rate(st):
    return {"US": 2, "TX": 2, "ATX": 1}.get(st, 3)


def wanted(pool, days, used, text):
    """The bills each place needs text for, preferring ones already written."""
    need = {}
    for st, e in pool.items():
        fresh = [c for c in e["bills"].values() if c["id"] not in used]
        count = rc_rate(st) * days + (EXTRA_DAYS_OF_FEDERAL if st == "US" else 0)
        ranked = rank(fresh, f"want-{st}")
        ranked.sort(key=lambda c: c["id"] not in text)  # stable: written ones first
        need[st] = ranked[:count]
    return need


def label(name, chamber):
    return chamber if name in chamber or chamber.startswith("U.S.") else f"{name} {chamber}"


def bill_row(c, st, name, t):
    level, jurisdiction = ("federal", "US") if st == "US" else ("local", "Austin, TX") if st == "ATX" else ("state", st)
    return {
        "id": c["id"], "level": level, "jurisdiction": jurisdiction, "number": c["number"],
        "origin": f"{label(name, c['originChamber'])}, {c['year']}",
        "title": t["title"], "shortTitle": t["shortTitle"], "summary": t["summary"], "topic": t["topic"],
        "chamberVotes": [{"chamber": label(name, v["chamber"]), "yeas": v["yeas"], "nays": v["nays"]} for v in c["chamberVotes"]],
        "passed": c["passed"], "outcome": c["outcome"], "sourceUrl": c["sourceUrl"],
    }


def caption(c, name, t):
    said = OUTCOME.get(c["outcome"]) or c["outcome"][0].lower() + c["outcome"][1:]
    return {
        "id": c["id"], "text": t["title"].rstrip(".") + ".", "origin": f"{label(name, c['originChamber'])}, {c['year']}",
        "real": True, "number": c["number"], "explanation": f"Real. {c['number']} {said}.", "sourceUrl": c["sourceUrl"],
    }


def landslide_chamber(bills):
    distinct = lambda ch: len({c["floor"][ch]["yeas"] - c["floor"][ch]["nays"] for c in bills if ch in c.get("floor", {})})
    best = max(("lower", "upper", "legislature"), key=distinct)
    return best if distinct(best) >= 4 else None


class Place:
    """One state's (or Congress's) bills and when each was last shown, so nothing comes back too soon."""

    def __init__(self, st, entry, used, text, days):
        self.st, self.name = st, entry["stateName"]
        self.text = text
        self.bills = [c for c in entry["bills"].values() if c["id"] in text and text[c["id"]].get("topic") in TOPICS]
        fresh = [c for c in self.bills if c["id"] not in used]
        broad = [c for c in fresh if not one_place(c)]
        if len(broad) >= rc_rate(st) * days:
            fresh = broad
        # Spread the supply evenly: a state with 28 bills for 14 days gets 2 a day, one with 20 gets 1 or 2.
        self.supply, self.days = min(len(fresh), rc_rate(st) * days), days
        ranked = rank(fresh, f"rc-{st}")
        half = len(ranked) // 2
        self.close, self.rest = ranked[:half], ranked[half:]
        self.chamber = landslide_chamber(self.bills)
        self.last_seen = {}

    def rc_on(self, day_index):
        share = lambda d: d * self.supply // self.days
        return share(day_index + 1) - share(day_index)

    def roll_call(self, day_index, used):
        out = []
        for i in range(self.rc_on(day_index)):
            # Mostly close votes, with one lopsided vote in the mix.
            first, second = (self.rest, self.close) if i == 2 else (self.close, self.rest)
            source = first or second
            if not source:
                break
            c = source.pop(0)
            out.append(c)
            used.add(c["id"])
        return out

    def least_recent(self, today, avoid, rng):
        options = [c for c in self.bills if c["id"] not in avoid]
        rng.shuffle(options)
        return sorted(options, key=lambda c: self.last_seen.get(c["id"], -1))

    def filed_or_fake(self, day_index, avoid, n, fakes, rng):
        real = self.least_recent(day_index, avoid, rng)[:4]
        if len(real) < 4:
            return None, []
        for c in real:
            self.last_seen[c["id"]] = day_index
        chambers = sorted({v["chamber"] for c in self.bills for v in c["chamberVotes"]})
        made_up = [{
            "id": f"fake-{fid}-{self.st.lower()}", "text": text, "origin": f"{label(self.name, chambers[k % len(chambers)])}, 2026",
            "real": False, "explanation": "Docket wrote this one. It is not a real bill.",
        } for k, (fid, text) in enumerate(fakes[(n * 7 + day_index * 4 + j) % len(fakes)] for j in range(4))]
        captions = [caption(c, self.name, self.text[c["id"]]) for c in real] + made_up
        rng.shuffle(captions)
        return captions, [c["id"] for c in real]

    def landslide(self, day_index, avoid, rng):
        if not self.chamber:
            return None, []
        margin = lambda c: c["floor"][self.chamber]["yeas"] - c["floor"][self.chamber]["nays"]
        options = [c for c in self.least_recent(day_index, avoid, rng) if self.chamber in c.get("floor", {})]
        chosen, margins = [], set()
        for c in options:
            if margin(c) not in margins:
                chosen.append(c)
                margins.add(margin(c))
            if len(chosen) == 4:
                break
        if len(chosen) < 4:
            return None, []
        for c in chosen:
            self.last_seen[c["id"]] = day_index
        rng.shuffle(chosen)
        items = [{"billId": c["id"], "number": c["number"], "title": self.text[c["id"]]["title"], "yeas": c["floor"][self.chamber]["yeas"],
                  "nays": c["floor"][self.chamber]["nays"], "sourceUrl": c["sourceUrl"]} for c in chosen]
        chamber = chosen[0]["floor"][self.chamber]["chamber"]
        return {"prompt": f"Drag to rank by the final {label(self.name, chamber)} vote, widest margin on top.", "items": items}, [c["id"] for c in chosen]


def rebuild_bills_and_votes(bank, pool, text):
    """Every bill the bank's days mention, and how each current member voted on them."""
    by_id = {c["id"]: (st, e["stateName"], c) for st, e in pool.items() for c in e["bills"].values()}
    ids = set()
    for day in bank["days"].values():
        for s in day.values():
            ids.update(s.get("rollCall", []))
            ids.update(c["id"] for c in s.get("filedOrFake", []) if c["real"])
            ids.update(i["billId"] for i in s.get("landslide", {}).get("items", []))
    bills, votes = [], {}
    for bid in sorted(ids):
        st, name, c = by_id[bid]
        bills.append(bill_row(c, st, name, text[bid]))
        for m in c.get("memberVotes", []):
            # Someone who changed chambers can appear twice on one bill; the later vote wins.
            votes[(m["id"], bid)] = {"lawmaker_id": m["id"], "bill_id": bid, "vote": m["vote"], "source_url": c["sourceUrl"]}
    bank["bills"] = bills
    bank["memberVotes"] = list(votes.values())


def status(bank, pool, text, used):
    days = sorted(bank["days"]) if bank else []
    today = central_today().isoformat()
    left = sum(1 for d in days if d >= today)
    print(f"bank: {len(days)} days, {days[0] if days else '-'} to {days[-1] if days else '-'}; {left} left from today ({today})")
    print("place: unused Roll Call bills with text / without text")
    for st, e in sorted(pool.items()):
        fresh = [c for c in e["bills"].values() if c["id"] not in used]
        print(f"  {st}: {sum(c['id'] in text for c in fresh)} / {sum(c['id'] not in text for c in fresh)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--missing", nargs=2, metavar=("DAYS", "OUT"))
    ap.add_argument("--days", type=int)
    args = ap.parse_args()

    pool = load_pool()
    text = read_json(TEXT) or {}
    bank = read_json(BANK) or {"days": {}, "bills": [], "memberVotes": []}
    used = used_on_earlier_days()
    for day in bank["days"].values():
        for s in day.values():
            used.update(s.get("rollCall", []))

    if args.status:
        status(bank, pool, text, used)
    elif args.missing:
        need = wanted(pool, int(args.missing[0]), used, text)
        rows = [{"id": c["id"], "state": pool[st]["stateName"], "number": c["number"], "officialTitle": c["officialTitle"],
                 "abstract": c.get("abstract", ""), "subjects": c.get("subjects", []), "outcome": c["outcome"]}
                for st, bills in sorted(need.items()) for c in bills if c["id"] not in text]
        with open(args.missing[1], "w") as f:
            json.dump(rows, f, indent=1, ensure_ascii=False)
        print(f"{len(rows)} bills need text, of {sum(len(b) for b in need.values())} wanted")
    elif args.days:
        start = max(central_today(), date.fromisoformat(max(bank["days"])) + timedelta(days=1)) if bank["days"] else central_today()
        places = {st: Place(st, e, used, text, args.days) for st, e in pool.items()}
        order = sorted(places)
        short = {st: f"{p.supply / args.days:.1f}" for st, p in places.items() if st != "ATX" and p.supply < rc_rate(st) * args.days}
        for i in range(args.days):
            day = (start + timedelta(days=i)).isoformat()
            rng = random.Random(day)
            sets = {}
            for n, st in enumerate(order):
                p = places[st]
                rc = p.roll_call(i, used)
                if st == "ATX":
                    if rc:
                        sets["TX/Austin"] = {"rollCall": [c["id"] for c in rc]}
                    continue
                today_ids = {c["id"] for c in rc}
                fakes = FEDERAL_FAKES if st == "US" else STATE_FAKES
                captions, shown = p.filed_or_fake(i, today_ids, n, fakes, rng)
                ls, ranked = p.landslide(i, today_ids | set(shown), rng)
                s = {"rollCall": [c["id"] for c in rc]}
                if captions:
                    s["filedOrFake"] = captions
                if ls:
                    s["landslide"] = ls
                sets["" if st == "US" else st] = s
            bank["days"][day] = sets
        rebuild_bills_and_votes(bank, pool, text)
        with gzip.open(BANK, "wt", encoding="utf-8") as f:
            json.dump(bank, f, ensure_ascii=False, sort_keys=True)
        print(f"bank: {len(bank['days'])} days to {max(bank['days'])}, {len(bank['bills'])} bills, {len(bank['memberVotes'])} member votes")
        print(f"fewer Roll Call bills a day than usual: {short or 'none'}")
        no_fof = sorted({st for d in bank["days"].values() for st in places if st not in ('ATX', 'US') and st in d and "filedOrFake" not in d[st]})
        no_ls = sorted({st for d in bank["days"].values() for st in places if st not in ('ATX', 'US') and st in d and "landslide" not in d[st]})
        print(f"using Congress's Filed or Fake on some days: {no_fof or 'none'}; Landslide: {no_ls or 'none'}")
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
