-- Reports of objectionable users or groups (App Store guideline 1.2), reviewed with `npm run moderate`.
CREATE TABLE reports (
  id bigserial PRIMARY KEY,
  reporter_id text REFERENCES users (id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('user', 'group')),
  target_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('harassment', 'hate', 'spam', 'impersonation', 'inappropriate', 'other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  action text, -- what the moderator did: 'none', 'reset-name', 'removed-group', 'suspended'
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX reports_open ON reports (created_at) WHERE status = 'open';
-- One open report per reporter and target, so a single person can't flood the queue.
CREATE UNIQUE INDEX reports_once ON reports (reporter_id, target_type, target_id) WHERE status = 'open';

-- A suspended account can't use the API.
ALTER TABLE users ADD COLUMN suspended_at timestamptz;
