-- The app orders friendship pairs by byte value (JS string comparison), so the check must too.
ALTER TABLE friendships DROP CONSTRAINT friendships_check;
ALTER TABLE friendships ADD CONSTRAINT friendships_ordered CHECK (user_a COLLATE "C" < user_b COLLATE "C");
