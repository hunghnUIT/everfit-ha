import get from 'lodash/get';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { runMigrateStep } from '../src/database/migrator';
import {
  DEFAULT_SEED_PATH,
  runSeed,
  SeedFile,
  validateSeedFile,
} from '../src/exercises/catalog-seed';
import { createEmptyDatabase, query } from './support/database';

// The real seed file, validated, as runMigrateStep gives it to runSeed.
function realSeed(): SeedFile {
  const result = validateSeedFile(
    JSON.parse(readFileSync(DEFAULT_SEED_PATH, 'utf8')),
  );
  if (!result.ok) throw new Error('the real seed file is invalid');
  return result.value;
}

// runSeed on one connection of the shared test database.
async function seed(file: SeedFile, log: (line: string) => void = () => {}) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await runSeed(client, file, log);
  } finally {
    client.release();
    await pool.end();
  }
}

const count = async (table: string) =>
  (await query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0].n;

const linksOf = (key: string) =>
  query<{ muscle_group: string; position: number }>(
    `SELECT muscle_group, position FROM exercise_muscle_groups
      WHERE exercise_key = $1 ORDER BY position`,
    [key],
  );

describe('the catalog seed (design §10.3)', () => {
  const file = realSeed();
  const links = file.exercises.reduce((n, e) => n + e.muscleGroups.length, 0);

  // Every file starts on a database that resetDatabase has seeded once.
  it('the seed run twice leaves no duplicates', async () => {
    await seed(file);
    await expect(count('muscle_groups')).resolves.toBe(
      file.muscleGroups.length,
    );
    await expect(count('exercises')).resolves.toBe(file.exercises.length);
    await expect(count('exercise_muscle_groups')).resolves.toBe(links);
    await expect(count('catalog_seed_ledger')).resolves.toBe(
      file.muscleGroups.length + file.exercises.length,
    );
    // Links keep the file's order, primary mover first.
    await expect(linksOf('bench press')).resolves.toEqual([
      { muscle_group: 'chest', position: 0 },
      { muscle_group: 'shoulders', position: 1 },
      { muscle_group: 'triceps', position: 2 },
    ]);
  });

  it('a deleted seeded exercise stays deleted on the next run', async () => {
    await query('DELETE FROM exercises WHERE exercise_key = $1', ['deadlift']);
    await seed(file);
    await expect(
      query('SELECT 1 FROM exercises WHERE exercise_key = $1', ['deadlift']),
    ).resolves.toEqual([]);
    await expect(linksOf('deadlift')).resolves.toEqual([]);
  });

  it("an exercise an admin created before the file added it keeps the admin's groups", async () => {
    // The admin's row, before a later file adds the same exercise.
    await query(
      `INSERT INTO exercises (exercise_key, name) VALUES ('zercher squat', 'Zercher Squat')`,
    );
    await query(
      `INSERT INTO exercise_muscle_groups (exercise_key, muscle_group, position)
       VALUES ('zercher squat', 'quads', 0)`,
    );
    await seed({
      ...file,
      exercises: [
        ...file.exercises,
        {
          name: 'ZERCHER SQUAT',
          key: 'zercher squat',
          muscleGroups: ['back', 'glutes'],
        },
      ],
    });
    await expect(
      query('SELECT name FROM exercises WHERE exercise_key = $1', [
        'zercher squat',
      ]),
    ).resolves.toEqual([{ name: 'Zercher Squat' }]);
    await expect(linksOf('zercher squat')).resolves.toEqual([
      { muscle_group: 'quads', position: 0 },
    ]);
    await expect(
      query(
        `SELECT 1 FROM catalog_seed_ledger WHERE kind = 'exercise' AND item_key = $1`,
        ['zercher squat'],
      ),
    ).resolves.toHaveLength(1);
  });

  it('logs a warning for a group an admin deleted, and inserts the rest', async () => {
    const lines: string[] = [];
    await seed(
      {
        ...file,
        muscleGroups: [...file.muscleGroups, 'neck'],
        exercises: [
          { name: 'Neck Curl', key: 'neck curl', muscleGroups: ['neck'] },
          {
            name: 'Neck Shrug',
            key: 'neck shrug',
            muscleGroups: ['traps', 'neck'],
          },
        ],
      },
      (line) => lines.push(line),
    );
    // "neck" was new in this run, so it exists: no warning.
    expect(lines).toEqual([]);
    await query(
      `DELETE FROM exercise_muscle_groups WHERE muscle_group = 'neck'`,
    );
    await query(`DELETE FROM muscle_groups WHERE name = 'neck'`);
    await seed(
      {
        ...file,
        muscleGroups: [...file.muscleGroups, 'neck'],
        exercises: [
          { name: 'Neck Bridge', key: 'neck bridge', muscleGroups: ['neck'] },
          {
            name: 'Neck Raise',
            key: 'neck raise',
            muscleGroups: ['traps', 'neck'],
          },
        ],
      },
      (line) => lines.push(line),
    );
    expect(lines).toHaveLength(2);
    await expect(linksOf('neck raise')).resolves.toEqual([
      { muscle_group: 'traps', position: 0 },
    ]);
    await expect(
      query(`SELECT 1 FROM catalog_seed_ledger WHERE item_key = 'neck bridge'`),
    ).resolves.toEqual([]);
  });

  it('deleting a muscle group an exercise lists answers 23503 (the default NO ACTION, V-20)', async () => {
    const error: unknown = await query(
      `DELETE FROM muscle_groups WHERE name = 'chest'`,
    ).catch((e: unknown) => e);
    expect(get(error, 'code')).toBe('23503');
  });

  it('a seed file with a 101-character name fails the migrate step on an empty database, naming exercises[0].name, and leaves it empty', async () => {
    const url = await createEmptyDatabase();
    const badFile = join(mkdtempSync(join(tmpdir(), 'seed-')), 'bad.json');
    writeFileSync(
      badFile,
      JSON.stringify({
        muscleGroups: ['chest'],
        exercises: [{ name: 'A'.repeat(101), muscleGroups: ['chest'] }],
      }),
    );
    await expect(
      runMigrateStep(
        { DATABASE_URL: url, LOG_LEVEL: 'fatal' },
        { seedPath: badFile },
      ),
    ).rejects.toThrow(
      'exercises[0].name: The name must be at most 100 characters; it has 101.',
    );
    await expect(
      query(`SELECT to_regclass('workout_entries') AS t`, [], url),
    ).resolves.toEqual([{ t: null }]);
  });
});
