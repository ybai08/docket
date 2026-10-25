-- Daily sets per place. scope is '' for everyone, a state ('CA'), or a city within a state ('TX/Austin').
-- Roll Call combines everyone's items with the player's state and city items; Filed or Fake and Landslide
-- use the most specific scope that has them (city, then state, then everyone).
ALTER TABLE daily_sets ADD COLUMN scope text NOT NULL DEFAULT '';
ALTER TABLE daily_sets DROP CONSTRAINT daily_sets_pkey;
ALTER TABLE daily_sets ADD PRIMARY KEY (day, scope, game, position);
