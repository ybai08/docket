"""Builds server/data/state-content.json.gz, which `npm run seed` loads: every state's bills and its part of
the daily set, from

  state-bill-picks.json.gz   fetch_state_bills.py: official titles, floor votes, outcomes, member votes
  state-bill-picks-extra.json   the same for states whose votes come from the legislature's own site
  state-bill-text.json    plain-English title, short title, summary and topic for each picked bill,
                          written from the official title and abstract only (see README)

Filed or Fake gets four of the state's real bills and four fakes from FAKES below; the fakes are
written by Docket, say nothing about any one state, and are always stamped as fakes after the answer.
Each game falls back on its own: a state without enough bills for Filed or Fake (4 real) or Landslide
(4 distinct margins) gets the default set's version of that game, and Roll Call then has only Congress.
"""

import gzip
import json
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_civic_data import DATA  # noqa: E402

DAY = "2026-10-25"
TOPICS = {
    "Public schools", "Colleges and tuition", "Housing and property tax", "Criminal justice", "Guns",
    "Immigration and border", "Energy and the grid", "Water and environment", "Health care",
    "Elections and voting", "Tech and privacy", "Taxes and budget", "Arts and culture",
}

FAKES = [
    ("fake-parking-poem", "Require every parking ticket written by state police to include a short poem."),
    ("fake-dmv-music", "Require driver's license offices to play calming music while people wait."),
    ("fake-capitol-flamingos", "Ban plastic lawn flamingos within 500 feet of the state capitol."),
    ("fake-reply-all", "Fine state employees who hit reply-all on emails sent to more than 50 people."),
    ("fake-capitol-naps", "Set aside a nap room in the state capitol for lawmakers during late-night sessions."),
    ("fake-state-emoji", "Pick an official state emoji for government social media accounts."),
    ("fake-squirrel-count", "Count the squirrels in every state park once every ten years."),
    ("fake-umbrella-loans", "Start a free umbrella lending program at every state office building."),
    ("fake-elevator-talk", "Ban small talk in state office building elevators during business hours."),
    ("fake-pothole-names", "Let people pay to name a pothole on a state highway until it gets fixed."),
    ("fake-plate-jokes", "Allow a joke in place of the slogan on standard state license plates."),
    ("fake-capitol-mascot", "Hire a costumed mascot to greet visitors at the state capitol."),
]

OUTCOME = {
    "Signed into law": "passed and was signed into law",
    "Became law": "passed and became law",
    "Vetoed by the governor": "passed but was vetoed by the governor",
}


def chamber_label(state_name, chamber):
    """'California' + 'Assembly' -> 'California Assembly'; leaves names that already say the state."""
    return chamber if chamber.startswith(state_name) else f"{state_name} {chamber}"


def main():
    with gzip.open(os.path.join(DATA, "state-bill-picks.json.gz"), "rt") as f:
        picks = json.load(f)
    # States Open States has no votes for, gathered from their legislatures' own sites in the same shape.
    extra = os.path.join(DATA, "state-bill-picks-extra.json")
    if os.path.exists(extra):
        picks.update(json.load(open(extra)))
    text = json.load(open(os.path.join(DATA, "state-bill-text.json")))
    bills, sets, member_votes, skipped = [], {}, [], []
    for n, (st, p) in enumerate(sorted(picks.items())):
        name = p["stateName"]
        chosen = p["roll-call"] + p["landslide"] + p["filed-or-fake"]
        missing = [c["id"] for c in chosen if c["id"] not in text or text[c["id"]].get("topic") not in TOPICS]
        if missing:
            skipped.append(f"{st} (missing text for {', '.join(missing)})")
            continue
        if not chosen:
            skipped.append(f"{st} (no bills with recorded votes)")
            continue
        for c in chosen:
            t = text[c["id"]]
            bills.append({
                "id": c["id"],
                "level": "state",
                "jurisdiction": st,
                "number": c["number"],
                "origin": f"{chamber_label(name, c['originChamber'])}, {c['year']}",
                "title": t["title"],
                "shortTitle": t["shortTitle"],
                "summary": t["summary"],
                "topic": t["topic"],
                "chamberVotes": [{"chamber": chamber_label(name, v["chamber"]), "yeas": v["yeas"], "nays": v["nays"]} for v in c["chamberVotes"]],
                "passed": c["passed"],
                "outcome": c["outcome"],
                "sourceUrl": c["sourceUrl"],
            })
            member_votes += [{"lawmaker_id": m["id"], "bill_id": c["id"], "vote": m["vote"], "source_url": c["openstatesUrl"]}
                             for m in c["memberVotes"]]

        rng = random.Random(f"{DAY}-{st}")  # same order every build
        real = [{
            "id": c["id"],
            "text": text[c["id"]]["title"].rstrip(".") + ".",
            "origin": f"{chamber_label(name, c['originChamber'])}, {c['year']}",
            "real": True,
            "number": c["number"],
            "explanation": f"Real. {c['number']} " + (OUTCOME.get(c["outcome"]) or c["outcome"][0].lower() + c["outcome"][1:]) + ".",
            "sourceUrl": c["sourceUrl"],
        } for c in p["filed-or-fake"]]
        # Fakes claim to come from the state's own chambers, like the real ones beside them.
        chambers = sorted({v["chamber"] for c in chosen for v in c["chamberVotes"]})
        fakes = [{
            "id": f"{fid}-{st.lower()}",
            "text": ftext,
            "origin": f"{chamber_label(name, chambers[k % len(chambers)])}, 2026",
            "real": False,
            "explanation": "Docket wrote this one. It is not a real bill.",
        } for k, (fid, ftext) in enumerate(FAKES[(n * 4 + j) % len(FAKES)] for j in range(4))]
        captions = real + fakes
        rng.shuffle(captions)
        items = [{"billId": c["id"], "number": c["number"], "title": text[c["id"]]["title"], "yeas": c["rankVote"]["yeas"],
                  "nays": c["rankVote"]["nays"], "sourceUrl": c["sourceUrl"]} for c in p["landslide"]]
        rng.shuffle(items)
        sets[st] = {
            "rollCall": [c["id"] for c in p["roll-call"]],
            "filedOrFake": captions if len(real) == 4 else [],
            "landslide": {
                "prompt": f"Drag to rank by the final {chamber_label(name, p['landslide'][0]['rankVote']['chamber'])} vote, widest margin on top."
                if len(items) == 4 else "",
                "items": items if len(items) == 4 else [],
            },
        }
        partial = [g for g, ok in (("Filed or Fake", len(real) == 4), ("Landslide", len(items) == 4), ("Roll Call", len(p["roll-call"]) == 3)) if not ok]
        if partial:
            skipped.append(f"{st} uses the default for: {', '.join(partial)}")

    # Someone who moved chambers can appear in both chambers' votes on one bill; keep their later vote.
    member_votes = list({(v["lawmaker_id"], v["bill_id"]): v for v in member_votes}.values())
    with gzip.open(os.path.join(DATA, "state-content.json.gz"), "wt", encoding="utf-8") as f:
        json.dump({"day": DAY, "bills": bills, "sets": sets, "memberVotes": member_votes}, f, ensure_ascii=False, sort_keys=True)
    print(f"{len(sets)} states, {len(bills)} bills, {len(member_votes)} member votes")
    if skipped:
        print("notes: " + "; ".join(skipped))


if __name__ == "__main__":
    main()
