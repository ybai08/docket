-- "Show me on group leaderboards" (global); per-group "Count me in group splits" lives on group_members.
ALTER TABLE users
  ADD COLUMN group_boards boolean NOT NULL DEFAULT true,
  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

-- One pending request per pair at a time.
CREATE UNIQUE INDEX friend_requests_pending ON friend_requests (from_id, to_id) WHERE status = 'pending';
CREATE INDEX friendships_b ON friendships (user_b);
CREATE INDEX game_results_day ON game_results (day, game);
