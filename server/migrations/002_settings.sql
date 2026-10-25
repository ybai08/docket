-- Reminder and notification preferences. "A friend votes the opposite way" is off by default.
ALTER TABLE users
  ADD COLUMN daily_reminder boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_friend_passes boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_streak_risk boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_weekly_recap boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_requests boolean NOT NULL DEFAULT true,
  ADD COLUMN notify_opposite_vote boolean NOT NULL DEFAULT false;
