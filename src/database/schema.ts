import {
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// For query typing only. The hand-written SQL in ./migrations is the schema
// (design §13): its checks and its indexes are not repeated here, and this file
// is never fed to drizzle-kit generate or push. created_at is marked as having
// a default so an insert may leave it out; id has one too, but the application
// always supplies it (a UUIDv7, in input order), so the type requires it.

export const workoutEntries = pgTable('workout_entries', {
  id: uuid('id').primaryKey(),
  userId: text('user_id').notNull(),
  exerciseName: text('exercise_name').notNull(),
  exerciseKey: text('exercise_key').notNull(),
  performedAt: timestamp('performed_at', {
    precision: 3,
    withTimezone: true,
  }).notNull(),
  utcOffsetMinutes: smallint('utc_offset_minutes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workoutSets = pgTable(
  'workout_sets',
  {
    entryId: uuid('entry_id').notNull(),
    setNumber: smallint('set_number').notNull(),
    reps: integer('reps').notNull(),
    // Exact decimal strings, never numbers (§6).
    weight: numeric('weight', { precision: 9, scale: 3 }).notNull(),
    unit: text('unit').notNull(),
    weightKg: numeric('weight_kg', { precision: 17, scale: 11 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.setNumber] })],
);

// The catalog (design §5 "Catalog tables"). The group's foreign key keeps the
// default NO ACTION in the SQL; it is not repeated here.

export const muscleGroups = pgTable('muscle_groups', {
  name: text('name').primaryKey(),
  createdAt: timestamp('created_at', { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exercises = pgTable('exercises', {
  exerciseKey: text('exercise_key').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { precision: 3, withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exerciseMuscleGroups = pgTable(
  'exercise_muscle_groups',
  {
    exerciseKey: text('exercise_key').notNull(),
    muscleGroup: text('muscle_group').notNull(),
    // The group's index in the list as written, primary mover first.
    position: smallint('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.exerciseKey, table.muscleGroup] })],
);

export const catalogSeedLedger = pgTable(
  'catalog_seed_ledger',
  {
    kind: text('kind', { enum: ['exercise', 'muscle_group'] }).notNull(),
    itemKey: text('item_key').notNull(),
    seededAt: timestamp('seeded_at', { precision: 3, withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.itemKey] })],
);
