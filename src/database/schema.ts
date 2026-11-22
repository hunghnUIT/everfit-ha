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
