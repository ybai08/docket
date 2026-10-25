-- Civic data for the whole country, not just Texas. Rows are replaced wholesale by `npm run seed`.
DELETE FROM lawmaker_votes;
DELETE FROM lawmakers;
DELETE FROM zip_districts;

ALTER TABLE lawmakers DROP CONSTRAINT lawmakers_body_check;
ALTER TABLE lawmakers
  ADD COLUMN state text NOT NULL, -- USPS code: TX, CA, DC, PR...
  ADD COLUMN city text, -- for city councils
  ADD COLUMN district_key text, -- normalized district, matched against zip_districts.code
  ADD COLUMN photo_source text, -- where the photo was downloaded from; photo_url is our own copy
  ADD CONSTRAINT lawmakers_body_check CHECK (body IN ('us-senate', 'us-house', 'state-upper', 'state-lower', 'city-council'));
DROP INDEX lawmakers_seat;
CREATE INDEX lawmakers_seat ON lawmakers (state, body, district_key);

ALTER TABLE zip_districts DROP CONSTRAINT zip_districts_kind_check;
ALTER TABLE zip_districts
  ADD COLUMN state text NOT NULL,
  ADD CONSTRAINT zip_districts_kind_check CHECK (kind IN ('county', 'city', 'us-house', 'state-upper', 'state-lower', 'city-council'));
-- A ZIP can cross a state line, and both states can have a district with the same number.
ALTER TABLE zip_districts DROP CONSTRAINT zip_districts_pkey;
ALTER TABLE zip_districts ADD PRIMARY KEY (zip, kind, state, code);
