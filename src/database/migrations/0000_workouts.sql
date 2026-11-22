-- Written by hand (design §5, §13); drizzle-kit only created the empty file.

-- One exercise performed at one moment by one user. Append-only in v1.
CREATE TABLE workout_entries (
  id            uuid           PRIMARY KEY DEFAULT uuidv7(),  -- supplied by the application (UUIDv7, in input order);
                                                              -- the default serves the benchmark-data seed and manual inserts
  user_id       text           NOT NULL CHECK (char_length(user_id) BETWEEN 1 AND 64),
  exercise_name text           NOT NULL,                      -- as entered (trimmed)
  exercise_key  text           NOT NULL                       -- normalised: NFKC, trim, collapse spaces, lowercase;
    CHECK (char_length(exercise_key) BETWEEN 1 AND 100),       -- the bound the application checks first (§10.1).
                                                              -- NOT a foreign key to the catalog (§10.6)
  performed_at  timestamptz(3) NOT NULL,                      -- the instant, UTC, to the millisecond (§8)
  utc_offset_minutes smallint  NULL                           -- the offset the client wrote, display only: 420 for +07:00;
    CHECK (utc_offset_minutes BETWEEN -720 AND 840),           -- NULL for Z or -00:00; never filtered, sorted or indexed (§8)
  created_at    timestamptz    NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE workout_sets (
  entry_id   uuid           NOT NULL REFERENCES workout_entries(id) ON DELETE CASCADE,
  set_number smallint       NOT NULL CHECK (set_number >= 1),
  reps       integer        NOT NULL CHECK (reps >= 1),
  weight     numeric(9,3)   NOT NULL CHECK (weight >= 0),         -- the original number, as sent
  unit       text           NOT NULL,                             -- canonical unit code; no enum/check (D-08)
  weight_kg  numeric(17,11) NOT NULL CHECK (weight_kg >= 0),      -- weight × kgPerUnit, exact: never rounded on write (§6)
  PRIMARY KEY (entry_id, set_number)
);
--> statement-breakpoint

-- History default order, keyset pagination and date range; INCLUDE serves the
-- two-step history query's name and muscle-group filters (§5, §9.2).
CREATE INDEX ix_entries_history
  ON workout_entries (user_id, performed_at DESC, id DESC) INCLUDE (exercise_key);
--> statement-breakpoint

-- The entry side of the PR join: one range scan per period (§5, §9.3).
CREATE INDEX ix_entries_exercise
  ON workout_entries (user_id, exercise_key, performed_at DESC, id DESC);
