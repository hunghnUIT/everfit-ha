-- Written by hand (design §5 "Catalog tables", §13); drizzle-kit only created the empty file.

-- The closed list of muscle groups. A new group is one admin call (§10.5).
CREATE TABLE muscle_groups (
  name        text PRIMARY KEY CHECK (char_length(name) BETWEEN 1 AND 40),  -- lowercase
  created_at  timestamptz(3) NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE exercises (
  exercise_key  text PRIMARY KEY CHECK (char_length(exercise_key) BETWEEN 1 AND 100),  -- same function as
                                                                                       -- workout_entries.exercise_key
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),             -- display spelling
  created_at    timestamptz(3) NOT NULL DEFAULT now(),
  updated_at    timestamptz(3) NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- The group's foreign key has no ON DELETE clause on purpose: the default,
-- NO ACTION, refuses deleting a group an exercise still lists with 23503,
-- which the group-delete route maps to 409. RESTRICT would answer 23001 (V-20).
CREATE TABLE exercise_muscle_groups (
  exercise_key  text     NOT NULL REFERENCES exercises (exercise_key) ON DELETE CASCADE,
  muscle_group  text     NOT NULL REFERENCES muscle_groups (name),    -- NO ACTION, the default
  position      smallint NOT NULL,          -- the order given on the write (primary mover first)
  PRIMARY KEY (exercise_key, muscle_group)
);
--> statement-breakpoint

-- Which items of seed/exercise-catalog.seed.json this database has already been given (§10.3).
CREATE TABLE catalog_seed_ledger (
  kind       text NOT NULL CHECK (kind IN ('exercise', 'muscle_group')),
  item_key   text NOT NULL,
  seeded_at  timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, item_key)
);
