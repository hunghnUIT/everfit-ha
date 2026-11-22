import get from 'lodash/get';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { v7 } from 'uuid';
import { runMigrateStep } from '../src/database/migrator';
import { createEmptyDatabase, query } from './support/database';

// The project keeps real dates out of files; Drizzle reads `when` only for order.
const JOURNAL_WHEN_BELOW = 1767225600000; // the first millisecond after 2025, in UTC

const JOURNAL = join(
  __dirname,
  '../src/database/migrations/meta/_journal.json',
);

const INSERT_ENTRY = `
  INSERT INTO workout_entries
    (id, user_id, exercise_name, exercise_key, performed_at, utc_offset_minutes)
  VALUES ($1, $2, $3, $4, $5, $6)`;

type EntryValues = {
  userId: string;
  exerciseKey: string;
  utcOffsetMinutes: number | null;
};

const valid: EntryValues = {
  userId: 'user-1',
  exerciseKey: 'bench press',
  utcOffsetMinutes: 420,
};

const insertEntry = (values: EntryValues) =>
  query(INSERT_ENTRY, [
    v7(),
    values.userId,
    'Bench Press',
    values.exerciseKey,
    '2025-02-10T09:00:00.000+07:00',
    values.utcOffsetMinutes,
  ]);

// The SQLSTATE the insert is refused with, or undefined when it succeeds.
async function refusalOf(values: EntryValues): Promise<unknown> {
  try {
    await insertEntry(values);
    return undefined;
  } catch (error) {
    return get(error, 'code');
  }
}

// The migrate step as compose runs it, without the api-only settings.
const migrateEnv = (url: string) => ({
  DATABASE_URL: url,
  LOG_LEVEL: 'fatal' as const,
});

const appliedMigrations = async (url: string) =>
  (
    await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations',
      [],
      url,
    )
  )[0].n;

describe('migrate', () => {
  it('creates workout_entries with the §5 checks', async () => {
    await expect(refusalOf(valid)).resolves.toBeUndefined();
    await expect(refusalOf({ ...valid, utcOffsetMinutes: 841 })).resolves.toBe(
      '23514',
    );
    await expect(
      refusalOf({ ...valid, exerciseKey: 'x'.repeat(101) }),
    ).resolves.toBe('23514');
    await expect(refusalOf({ ...valid, userId: '' })).resolves.toBe('23514');
  });

  it('creates both indexes as §5 defines them', async () => {
    const indexes = await query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'workout_entries' ORDER BY indexname`,
    );
    // The two secondary indexes are the whole budget (§5).
    expect(indexes.map((i) => i.indexname)).toEqual([
      'ix_entries_exercise',
      'ix_entries_history',
      'workout_entries_pkey',
    ]);
    const definition = (name: string) =>
      indexes.find((i) => i.indexname === name)?.indexdef;
    expect(definition('ix_entries_history')).toContain(
      '(user_id, performed_at DESC, id DESC) INCLUDE (exercise_key)',
    );
    expect(definition('ix_entries_exercise')).toContain(
      '(user_id, exercise_key, performed_at DESC, id DESC)',
    );
  });

  it('runs twice on an empty database without error', async () => {
    const url = await createEmptyDatabase();
    await runMigrateStep(migrateEnv(url));
    await runMigrateStep(migrateEnv(url));
    await expect(appliedMigrations(url)).resolves.toBe(1);
    await expect(query('SELECT 1 FROM workout_sets', [], url)).resolves.toEqual(
      [],
    );
  });

  it('two migrate steps at once on an empty database both succeed', async () => {
    const url = await createEmptyDatabase();
    // Drizzle's migrator takes no lock: without MIGRATE_LOCK the two race on
    // CREATE SCHEMA and the tables.
    await Promise.all([
      runMigrateStep(migrateEnv(url)),
      runMigrateStep(migrateEnv(url)),
    ]);
    await expect(appliedMigrations(url)).resolves.toBe(1);
  });

  it('the test database session zone is America/Los_Angeles', async () =>
    expect(query('SHOW timezone')).resolves.toEqual([
      { TimeZone: 'America/Los_Angeles' },
    ]));

  it("every journal entry's when is a fixed 2025 value, increasing in idx order", () => {
    const { entries } = JSON.parse(readFileSync(JOURNAL, 'utf8')) as {
      entries: { idx: number; when: number }[];
    };
    const whens = [...entries].sort((a, b) => a.idx - b.idx).map((e) => e.when);
    for (const when of whens) expect(when).toBeLessThan(JOURNAL_WHEN_BELOW);
    whens.slice(1).forEach((when, i) => expect(when).toBeGreaterThan(whens[i]));
  });
});
