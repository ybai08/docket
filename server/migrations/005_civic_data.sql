-- Who represents whom, stored once and read locally: lawmakers, their recorded votes, and which
-- districts each Texas ZIP code falls in. Built by scripts/build_civic_data.py and loaded by
-- `npm run seed`, so the API never looks up districts or representatives at request time.

CREATE TABLE lawmakers (
  id text PRIMARY KEY, -- Bioguide ID, OpenStates person ID, or atx-<district>
  body text NOT NULL CHECK (body IN ('us-senate', 'us-house', 'tx-senate', 'tx-house', 'atx-council')),
  name text NOT NULL,
  title text NOT NULL, -- Senator, Representative, Mayor, Council Member...
  party text CHECK (party IN ('D', 'R', 'I')), -- null for nonpartisan offices
  district text, -- null for statewide and citywide seats
  photo_url text,
  photo_credit text, -- set when the photo's license asks for attribution
  source_url text NOT NULL
);
CREATE INDEX lawmakers_seat ON lawmakers (body, district);

CREATE TABLE lawmaker_votes (
  lawmaker_id text NOT NULL REFERENCES lawmakers (id) ON DELETE CASCADE,
  bill_id text NOT NULL REFERENCES bills (id),
  vote text NOT NULL CHECK (vote IN ('yea', 'nay')),
  source_url text NOT NULL,
  PRIMARY KEY (lawmaker_id, bill_id)
);
CREATE INDEX lawmaker_votes_bill ON lawmaker_votes (bill_id);

-- A ZIP can straddle districts; share is the fraction of the ZIP's land in each one, from the
-- Census 2020 relationship files. Austin council districts use the ZIP's center point instead.
CREATE TABLE zip_districts (
  zip text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('county', 'city', 'us-house', 'tx-senate', 'tx-house', 'atx-council')),
  code text NOT NULL,
  name text NOT NULL,
  share real NOT NULL CHECK (share > 0 AND share <= 1),
  PRIMARY KEY (zip, kind, code)
);
