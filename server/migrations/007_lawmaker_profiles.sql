-- Sourced background, links, start year and committees per lawmaker, from scripts/build_lawmaker_profiles.py.
-- Each JSON block carries its own source name and URL. Replaced wholesale by `npm run seed`.
CREATE TABLE lawmaker_profiles (
  lawmaker_id text PRIMARY KEY REFERENCES lawmakers (id) ON DELETE CASCADE,
  in_office_since text, -- year they took their current seat, where known
  background jsonb, -- { text, sourceName, sourceUrl }
  committees jsonb, -- { items, sourceName, sourceUrl }
  links jsonb NOT NULL DEFAULT '[]' -- [{ label, url }]
);
