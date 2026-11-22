import {
  BG_PREFIX,
  generateBenchData,
  HEAVY_USER,
  SINGLE_USER,
} from '../scripts/bench-data';
import { loadContext } from '../scripts/bench';
import { query } from './support/database';

// §11 at 1 % of full scale: 500 entries for the heavy user.
const SCALE = 0.01;
const MAINS = [
  'bench press',
  'squat',
  'deadlift',
  'overhead press',
  'barbell row',
];

const perUserAndExercise = () =>
  query<{ user_id: string; exercise_key: string; n: string }>(
    `SELECT user_id, exercise_key, count(*) AS n FROM workout_entries
      GROUP BY user_id, exercise_key ORDER BY user_id, exercise_key`,
  );

describe('benchmark data (design §11, at 1 % scale)', () => {
  let firstRun: Awaited<ReturnType<typeof perUserAndExercise>>;

  beforeAll(async () => {
    await generateBenchData(process.env.DATABASE_URL ?? '', SCALE);
    firstRun = await perUserAndExercise();
  });

  it('gives bench-heavy 500 entries', async () => {
    const [row] = await query<{ n: string }>(
      `SELECT count(*) AS n FROM workout_entries WHERE user_id = $1`,
      [HEAVY_USER],
    );
    expect(Number(row.n)).toBe(500);
  });

  it('holds 5 to 8 % of the heavy entries in the most-trained exercise, over about 150 exercises at full scale', async () => {
    const rows = await query<{ n: string }>(
      `SELECT count(*) AS n FROM workout_entries WHERE user_id = $1
        GROUP BY exercise_key ORDER BY n DESC LIMIT 1`,
      [HEAVY_USER],
    );
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(25);
    expect(Number(rows[0].n)).toBeLessThanOrEqual(40);
  });

  it('groups the heavy entries in sessions of 5 to 12 that share one instant', async () => {
    const rows = await query<{ n: string }>(
      `SELECT count(*) AS n FROM workout_entries WHERE user_id = $1
        GROUP BY performed_at`,
      [HEAVY_USER],
    );
    expect(rows.length).toBeGreaterThan(30);
    for (const { n } of rows) {
      expect(Number(n)).toBeGreaterThanOrEqual(5);
      expect(Number(n)).toBeLessThanOrEqual(12);
    }
  });

  it('gives main lifts 6 to 10 sets and accessories 3 or 4', async () => {
    const rows = await query<{ exercise_key: string; n: number }>(
      `SELECT e.exercise_key, count(*)::int AS n
         FROM workout_entries e JOIN workout_sets s ON s.entry_id = e.id
        WHERE e.user_id = $1 GROUP BY e.id, e.exercise_key`,
      [HEAVY_USER],
    );
    const mains = rows.filter((r) => MAINS.includes(r.exercise_key));
    const accessories = rows.filter((r) => !MAINS.includes(r.exercise_key));
    expect(mains.length).toBeGreaterThan(0);
    expect(accessories.length).toBeGreaterThan(0);
    for (const r of mains) {
      expect(r.n).toBeGreaterThanOrEqual(6);
      expect(r.n).toBeLessThanOrEqual(10);
    }
    for (const r of accessories) {
      expect(r.n).toBeGreaterThanOrEqual(3);
      expect(r.n).toBeLessThanOrEqual(4);
    }
  });

  it('writes an offset on every entry, and a local hour in the morning or the evening', async () => {
    const [row] = await query<{ total: string; bad: string }>(
      `WITH local AS (
         SELECT utc_offset_minutes AS off,
                extract(hour FROM (performed_at AT TIME ZONE 'UTC')
                                  + utc_offset_minutes * interval '1 minute') AS h
           FROM workout_entries)
       SELECT count(*) AS total,
              count(*) FILTER (WHERE off IS NULL
                                  OR NOT (h BETWEEN 5 AND 11 OR h BETWEEN 17 AND 21)) AS bad
         FROM local`,
    );
    expect(Number(row.total)).toBeGreaterThan(0);
    expect(Number(row.bad)).toBe(0);
  });

  it('keeps reps from 1 to 30 and weights on plate steps (2.5 kg, 5 lb)', async () => {
    const [row] = await query<{ bad: string }>(
      `SELECT count(*) FILTER (WHERE reps NOT BETWEEN 1 AND 30
                                OR weight <= 0
                                OR (unit = 'kg' AND weight % 2.5 <> 0)
                                OR (unit = 'lb' AND weight % 5 <> 0)) AS bad
         FROM workout_sets`,
    );
    expect(Number(row.bad)).toBe(0);
  });

  it('gives bench-single one exercise', async () => {
    const [row] = await query<{ keys: string; n: string }>(
      `SELECT count(DISTINCT exercise_key) AS keys, count(*) AS n
         FROM workout_entries WHERE user_id = $1`,
      [SINGLE_USER],
    );
    expect(Number(row.keys)).toBe(1);
    expect(Number(row.n)).toBe(500);
  });

  it('puts about ten times the heavy rows in the background users', async () => {
    const [row] = await query<{ n: string; users: string }>(
      `SELECT count(*) AS n, count(DISTINCT user_id) AS users
         FROM workout_entries WHERE user_id LIKE $1`,
      [`${BG_PREFIX}%`],
    );
    expect(Number(row.n)).toBeGreaterThanOrEqual(4500);
    expect(Number(row.n)).toBeLessThanOrEqual(5500);
    expect(Number(row.users)).toBeGreaterThan(1);
  });

  it('gives the same counts per user and exercise on a second run', async () => {
    await generateBenchData(process.env.DATABASE_URL ?? '', SCALE);
    expect(await perUserAndExercise()).toEqual(firstRun);
  });

  it('reads the context the cases need: the top key and a rarer key, group', async () => {
    const ctx = await loadContext(process.env.DATABASE_URL ?? '');
    expect(MAINS).toContain(ctx.topKey);
    expect(ctx.rareKey).not.toBe(ctx.topKey);
    expect(ctx.rareGroup.length).toBeGreaterThan(0);
  });
});
