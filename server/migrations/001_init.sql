-- Docket schema v1. Every agreement figure and split is computed here, never in the app.

CREATE TABLE users (
  id text PRIMARY KEY, -- Firebase uid
  username text UNIQUE,
  display_name text,
  zip text,
  state text,
  county text,
  city text,
  districts jsonb,
  issues text[] NOT NULL DEFAULT '{}',
  share_votes boolean NOT NULL DEFAULT false,
  allow_username boolean NOT NULL DEFAULT true,
  match_contacts boolean NOT NULL DEFAULT false,
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bills (
  id text PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('federal', 'state', 'local')),
  jurisdiction text NOT NULL,
  number text NOT NULL,
  origin text NOT NULL,
  title text NOT NULL,
  short_title text NOT NULL,
  summary text NOT NULL,
  topic text NOT NULL,
  chamber_votes jsonb NOT NULL, -- [{chamber, yeas, nays, consent}]
  passed boolean NOT NULL,
  outcome text NOT NULL,
  source_url text NOT NULL
);

-- One row per item in a day's game. Roll Call rows point at bills; the other games keep
-- their caption or ranking item in payload.
CREATE TABLE daily_sets (
  day date NOT NULL,
  game text NOT NULL CHECK (game IN ('roll-call', 'filed-or-fake', 'landslide')),
  position int NOT NULL,
  bill_id text REFERENCES bills (id),
  payload jsonb,
  PRIMARY KEY (day, game, position)
);

CREATE TABLE votes (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bill_id text NOT NULL REFERENCES bills (id),
  day date NOT NULL,
  vote text NOT NULL CHECK (vote IN ('yea', 'nay')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bill_id)
);
CREATE INDEX votes_bill_day ON votes (bill_id, day);

-- score is null until the game is finished; detail holds partial progress.
CREATE TABLE game_results (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day date NOT NULL,
  game text NOT NULL CHECK (game IN ('roll-call', 'filed-or-fake', 'landslide')),
  score int,
  detail jsonb NOT NULL DEFAULT '{}',
  finished_at timestamptz,
  PRIMARY KEY (user_id, day, game)
);

CREATE TABLE friendships (
  user_a text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_b text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE friend_requests (
  id bigserial PRIMARY KEY,
  from_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE share_overrides (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  friend_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  share boolean NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE invites (
  token text PRIMARY KEY,
  inviter_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked boolean NOT NULL DEFAULT false
);

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  admin_id text NOT NULL REFERENCES users (id),
  code char(6) NOT NULL UNIQUE,
  approval_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  include_in_splits boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE blocks (
  blocker_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (blocker_id, blocked_id)
);
