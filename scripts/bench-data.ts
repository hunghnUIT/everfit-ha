// Benchmark data (design §11): shaped like real training, loaded in bulk.
//
// Usage: DATABASE_URL=… [BENCH_SCALE=1] npm run bench:data
//
// The plan (users, sessions, exercise quotas) is worked out here in a few
// thousand rows; the entries and sets are then generated inside the database,
// one INSERT … SELECT … ORDER BY performed_at per table, so rows land in date
// order across all users (§11). Nothing is random: quotas and strides are
// arithmetic, so the shape holds on every run and two runs give the same
// counts.
import { performance } from 'node:perf_hooks';
import { Client } from 'pg';

// The local midnight of the last generated day. Every instant is this plus a
// whole number of minutes, so no session time zone takes part.
export const BENCH_ANCHOR = '2025-12-31T00:00:00Z';

export const HEAVY_USER = 'bench-heavy';
export const SINGLE_USER = 'bench-single';
export const BG_PREFIX = 'bench-bg-';

const HEAVY_ENTRIES = 50_000;
const HEAVY_VOCABULARY = 150;
const HEAVY_SPAN_DAYS = 22 * 365;
const BG_ENTRIES_PER_USER = 500;
const BG_VOCABULARY = 20;
// The main lifts, with a working weight in kg to start from.
const MAIN_LIFTS: Record<string, number> = {
  'bench press': 80,
  squat: 110,
  deadlift: 130,
  'overhead press': 50,
  'barbell row': 70,
};
const GROUP_PRIORITY = [
  'chest',
  'back',
  'quads',
  'shoulders',
  'biceps',
  'triceps',
  'hamstrings',
  'glutes',
  'abs',
  'calves',
  'traps',
  'forearms',
];
// Session sizes cycle through these (5–12 entries, mean 8.5, as real logging
// groups them); the tail is adjusted so the total is exact.
const SIZE_PATTERN = [8, 5, 11, 7, 12, 6, 9, 10];
// Offsets the clients wrote, in minutes; none is 0, which would be stored as NULL.
const OFFSETS = [420, -480, -300, 60, 120, 330, 540, -420];

type CatalogExercise = { key: string; name: string; primaryGroup: string };

type Vocab = {
  key: string;
  name: string;
  quota: number;
  baseKg: number;
  setsBase: number;
  setsSpan: number;
};

type UserPlan = {
  userId: string;
  group: 'heavy' | 'single' | 'background';
  entries: number;
  unit: 'kg' | 'lb';
  utcOffset: number;
  spanDays: number;
  dayShift: number;
  vocab: Vocab[];
};

export type BenchDataResult = {
  heavyEntries: number;
  heavySets: number;
  singleEntries: number;
  singleSets: number;
  backgroundUsers: number;
  backgroundEntries: number;
  backgroundSets: number;
  elapsedMs: number;
};

// Sizes of the sessions that hold `n` entries, each 5 to 12.
export function sessionSizes(n: number): number[] {
  if (n < 5) throw new Error(`a session needs at least 5 entries, got ${n}`);
  const sizes: number[] = [];
  let remaining = n;
  for (let i = 0; remaining > 17; i++) {
    const size = SIZE_PATTERN[i % SIZE_PATTERN.length];
    sizes.push(size);
    remaining -= size;
  }
  // 5 to 17 left: one session, or two of 6 to 8.
  if (remaining <= 12) sizes.push(remaining);
  else sizes.push(Math.ceil(remaining / 2), Math.floor(remaining / 2));
  return sizes;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Entry i takes the exercise at position (i × stride) mod n of the quota
// ranges. A stride near n × 0.618 and coprime with n is a permutation that
// spreads neighbours across the whole range, so one session rarely repeats a
// popular exercise.
export function strideFor(n: number): number {
  let stride = Math.max(1, Math.round(n * 0.6180339887));
  while (gcd(stride, n) !== 1) stride++;
  return stride;
}

// Largest remainder: counts that follow the weights and sum to exactly n.
export function apportion(n: number, weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  const raw = weights.map((w) => (w / total) * n);
  const counts = raw.map(Math.floor);
  let leftover = n - counts.reduce((sum, c) => sum + c, 0);
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (leftover-- <= 0) break;
    counts[index]++;
  }
  return counts;
}

const keyOf = (name: string) => name.toLowerCase();

function vocabEntry(
  key: string,
  name: string,
  weight: number,
  index: number,
): Pick<Vocab, 'key' | 'name' | 'baseKg' | 'setsBase' | 'setsSpan'> & {
  weight: number;
} {
  const main = key in MAIN_LIFTS;
  return {
    key,
    name,
    weight,
    // Main lifts: 6 to 10 sets, warm-ups included; accessories: 3 or 4.
    baseKg: main ? MAIN_LIFTS[key] : 15 + ((index * 7) % 45),
    setsBase: main ? 6 : 3,
    setsSpan: main ? 5 : 2,
  };
}

function withQuotas(n: number, rows: ReturnType<typeof vocabEntry>[]): Vocab[] {
  const quotas = apportion(
    n,
    rows.map((r) => r.weight),
  );
  return rows.map(({ weight: _weight, ...row }, i) => ({
    ...row,
    quota: quotas[i],
  }));
}

function heavyVocabulary(n: number, catalog: CatalogExercise[]): Vocab[] {
  const mains = Object.keys(MAIN_LIFTS).map((key) => {
    const found = catalog.find((e) => e.key === key);
    if (!found) throw new Error(`the catalog has no "${key}"`);
    return found;
  });
  const others = catalog
    .filter((e) => !(e.key in MAIN_LIFTS))
    .sort(
      (a, b) =>
        GROUP_PRIORITY.indexOf(a.primaryGroup) -
          GROUP_PRIORITY.indexOf(b.primaryGroup) || a.key.localeCompare(b.key),
    );
  // About 150 distinct exercises: the catalog plus names the catalog lacks
  // (an entry's key is not a foreign key, §10.6), interleaved so the rare
  // catalog exercises sit in the tail.
  const customCount = Math.max(0, HEAVY_VOCABULARY - catalog.length);
  const customs = Array.from({ length: customCount }, (_, j) => {
    const name = `Custom Lift ${String(j + 1).padStart(2, '0')}`;
    return { key: keyOf(name), name };
  });
  const interleaved: { key: string; name: string; order: number }[] = [
    ...others.map((e, i) => ({ key: e.key, name: e.name, order: 2 * i })),
    ...customs.map((e, j) => ({ ...e, order: 2 * j + 1 })),
  ].sort((a, b) => a.order - b.order);
  const ranked = [...mains, ...interleaved];
  // Rank r gets weight 1 / (r + 3): the first exercise holds about 6.6 % of
  // 150 (the design's 5 to 8 %).
  return withQuotas(
    n,
    ranked.map((e, i) => vocabEntry(e.key, e.name, 1 / (i + 1 + 3), i)),
  );
}

function backgroundVocabulary(u: number, catalog: CatalogExercise[]): Vocab[] {
  const sorted = [...catalog].sort((a, b) => a.key.localeCompare(b.key));
  const rows = Array.from({ length: BG_VOCABULARY }, (_, r) => {
    const e = sorted[(u * 11 + r * 4) % sorted.length];
    return vocabEntry(e.key, e.name, 1 / (r + 2), r);
  });
  return withQuotas(BG_ENTRIES_PER_USER, rows);
}

export function planUsers(
  scale: number,
  catalog: CatalogExercise[],
): UserPlan[] {
  const heavyEntries = Math.round(HEAVY_ENTRIES * scale);
  if (heavyEntries < 100) {
    throw new Error(
      'BENCH_SCALE is too small: the heavy user needs 100 entries',
    );
  }
  const backgroundUsers = Math.max(
    1,
    Math.round((10 * heavyEntries) / BG_ENTRIES_PER_USER),
  );
  const bench = catalog.find((e) => e.key === 'bench press');
  if (!bench) throw new Error('the catalog has no "bench press"');
  const plans: UserPlan[] = [
    {
      userId: HEAVY_USER,
      group: 'heavy',
      entries: heavyEntries,
      unit: 'kg',
      utcOffset: 420,
      spanDays: HEAVY_SPAN_DAYS,
      dayShift: 0,
      vocab: heavyVocabulary(heavyEntries, catalog),
    },
    {
      // What a quick seed loop makes: one exercise, once a day, three sets.
      userId: SINGLE_USER,
      group: 'single',
      entries: heavyEntries,
      unit: 'kg',
      utcOffset: 420,
      spanDays: heavyEntries,
      dayShift: 0,
      vocab: [
        {
          key: bench.key,
          name: bench.name,
          quota: heavyEntries,
          baseKg: 60,
          setsBase: 3,
          setsSpan: 1,
        },
      ],
    },
  ];
  for (let u = 1; u <= backgroundUsers; u++) {
    plans.push({
      userId: `${BG_PREFIX}${String(u).padStart(4, '0')}`,
      group: 'background',
      entries: BG_ENTRIES_PER_USER,
      unit: u % 4 === 0 ? 'lb' : 'kg',
      utcOffset: OFFSETS[u % OFFSETS.length],
      spanDays: 365 * (1 + (u % 3)),
      dayShift: u % 30,
      vocab: backgroundVocabulary(u, catalog),
    });
  }
  return plans;
}

// Column arrays for the three temporary tables, sent as one parameter each.
function planTables(plans: UserPlan[]) {
  const users = {
    id: [] as string[],
    grp: [] as string[],
    n: [] as number[],
    stride: [] as number[],
    unit: [] as string[],
    offset: [] as number[],
  };
  const vocab = {
    userId: [] as string[],
    key: [] as string[],
    name: [] as string[],
    start: [] as number[],
    end: [] as number[],
    baseKg: [] as number[],
    setsBase: [] as number[],
    setsSpan: [] as number[],
  };
  const sessions = {
    userId: [] as string[],
    firstI: [] as number[],
    size: [] as number[],
    minutes: [] as number[],
  };
  for (const p of plans) {
    users.id.push(p.userId);
    users.grp.push(p.group);
    users.n.push(p.entries);
    users.stride.push(strideFor(p.entries));
    users.unit.push(p.unit);
    users.offset.push(p.utcOffset);
    let cursor = 0;
    for (const v of p.vocab) {
      vocab.userId.push(p.userId);
      vocab.key.push(v.key);
      vocab.name.push(v.name);
      vocab.start.push(cursor);
      vocab.end.push(cursor + v.quota);
      vocab.baseKg.push(v.baseKg);
      vocab.setsBase.push(v.setsBase);
      vocab.setsSpan.push(v.setsSpan);
      cursor += v.quota;
    }
    const sizes = p.group === 'single' ? [] : sessionSizes(p.entries);
    const sessionCount = p.group === 'single' ? p.entries : sizes.length;
    let firstI = 0;
    for (let s = 0; s < sessionCount; s++) {
      const size = p.group === 'single' ? 1 : sizes[s];
      const day =
        Math.floor((s * p.spanDays) / sessionCount) -
        (p.spanDays - 1) -
        p.dayShift;
      // Mornings (06:00 to 08:59) and evenings (18:00 to 20:59), local.
      const hour = (s % 5 < 2 ? 6 : 18) + (s % 3);
      const localMinute = hour * 60 + ((s * 7) % 60);
      sessions.userId.push(p.userId);
      sessions.firstI.push(firstI);
      sessions.size.push(size);
      sessions.minutes.push(day * 1440 + localMinute - p.utcOffset);
      firstI += size;
    }
  }
  return { users, vocab, sessions };
}

async function readCatalog(client: Client): Promise<CatalogExercise[]> {
  const { rows } = await client.query<{
    exercise_key: string;
    name: string;
    muscle_group: string;
  }>(
    `SELECT e.exercise_key, e.name, g.muscle_group
       FROM exercises e
       JOIN exercise_muscle_groups g
         ON g.exercise_key = e.exercise_key AND g.position = 0
      ORDER BY e.exercise_key`,
  );
  return rows.map((r) => ({
    key: r.exercise_key,
    name: r.name,
    primaryGroup: r.muscle_group,
  }));
}

export async function generateBenchData(
  databaseUrl: string,
  scale: number,
): Promise<BenchDataResult> {
  const started = performance.now();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const catalog = await readCatalog(client);
    if (catalog.length === 0) {
      throw new Error(
        'the exercise catalog is empty; run the migrate step first',
      );
    }
    const t = planTables(planUsers(scale, catalog));

    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE bench_users (
        user_id text, grp text, n int, stride bigint, unit text, utc_offset int
      ) ON COMMIT DROP`);
    await client.query(`CREATE TEMP TABLE bench_vocab (
        user_id text, key text, name text, cum_start int, cum_end int,
        base_kg numeric, sets_base int, sets_span int
      ) ON COMMIT DROP`);
    await client.query(`CREATE TEMP TABLE bench_sessions (
        user_id text, first_i int, size int, minutes int
      ) ON COMMIT DROP`);
    await client.query(
      `INSERT INTO bench_users SELECT * FROM unnest(
         $1::text[], $2::text[], $3::int[], $4::bigint[], $5::text[], $6::int[])`,
      [
        t.users.id,
        t.users.grp,
        t.users.n,
        t.users.stride,
        t.users.unit,
        t.users.offset,
      ],
    );
    await client.query(
      `INSERT INTO bench_vocab SELECT * FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::int[], $5::int[],
         $6::numeric[], $7::int[], $8::int[])`,
      [
        t.vocab.userId,
        t.vocab.key,
        t.vocab.name,
        t.vocab.start,
        t.vocab.end,
        t.vocab.baseKg,
        t.vocab.setsBase,
        t.vocab.setsSpan,
      ],
    );
    await client.query(
      `INSERT INTO bench_sessions SELECT * FROM unnest(
         $1::text[], $2::int[], $3::int[], $4::int[])`,
      [
        t.sessions.userId,
        t.sessions.firstI,
        t.sessions.size,
        t.sessions.minutes,
      ],
    );

    // A second run replaces the first; the sets go with their entries.
    await client.query(
      `DELETE FROM workout_entries WHERE user_id LIKE 'bench-%'`,
    );

    // One row per entry, with the exercise its position in the quota ranges
    // gives it. The ids are generated here, in date order, so the sets can
    // point at them.
    await client.query(
      `CREATE TEMP TABLE bench_entries ON COMMIT DROP AS
       SELECT uuidv7() AS id, e.user_id, e.grp, e.i, e.n, e.performed_at,
              e.utc_offset, e.unit, e.key, e.name, e.base_kg, e.sets_base,
              e.sets_base + (e.i % e.sets_span) AS nsets
         FROM (
           SELECT s.user_id, u.grp, i, u.n, u.unit, u.utc_offset,
                  $1::timestamptz + make_interval(mins => s.minutes) AS performed_at,
                  v.key, v.name, v.base_kg, v.sets_base, v.sets_span
             FROM bench_sessions s
             JOIN bench_users u ON u.user_id = s.user_id
            CROSS JOIN LATERAL generate_series(s.first_i, s.first_i + s.size - 1) AS i
             JOIN bench_vocab v
               ON v.user_id = s.user_id
              AND (i::bigint * u.stride) % u.n >= v.cum_start
              AND (i::bigint * u.stride) % u.n < v.cum_end
         ) e
        ORDER BY e.performed_at, e.user_id, e.i`,
      [BENCH_ANCHOR],
    );
    await client.query(
      `INSERT INTO workout_entries
         (id, user_id, exercise_name, exercise_key, performed_at, utc_offset_minutes)
       SELECT id, user_id, name, key, performed_at, utc_offset
         FROM bench_entries
        ORDER BY performed_at, user_id, i`,
    );
    // Weights climb with the years and step by 2.5 kg or 5 lb. A main lift
    // ramps up over its first four sets (warm-ups of 5 to 7 reps first);
    // working sets are 3 to 6 reps. Accessories are 8 to 15 reps at one weight.
    await client.query(
      `INSERT INTO workout_sets (entry_id, set_number, reps, weight, unit, weight_kg)
       SELECT w.id, w.k, w.reps, w.weight, w.unit,
              w.weight * CASE w.unit WHEN 'lb' THEN 0.45359237 ELSE 1 END
         FROM (
           SELECT e.id, k, e.unit,
                  CASE WHEN e.sets_base = 6
                       THEN CASE WHEN k <= 3 THEN 8 - k ELSE 3 + ((e.i + k) % 4) END
                       ELSE 8 + ((e.i + k) % 8) END AS reps,
                  greatest(
                    CASE e.unit WHEN 'lb' THEN 5 ELSE 2.5 END,
                    round(
                      e.base_kg * (0.7 + 0.3 * e.i / e.n)
                        * CASE WHEN e.sets_base = 6 AND k <= 4
                               THEN 0.25 + 0.15 * k ELSE 1 END
                        / (CASE e.unit WHEN 'lb' THEN 5 * 0.45359237 ELSE 2.5 END)
                    ) * (CASE e.unit WHEN 'lb' THEN 5 ELSE 2.5 END)
                  ) AS weight
             FROM bench_entries e
            CROSS JOIN LATERAL generate_series(1, e.nsets) AS k
         ) w
        ORDER BY w.id, w.k`,
    );
    const { rows: counts } = await client.query<{
      grp: string;
      users: string;
      entries: string;
      sets: string;
    }>(
      `SELECT grp, count(DISTINCT user_id) AS users, count(*) AS entries,
              sum(nsets) AS sets
         FROM bench_entries GROUP BY grp`,
    );
    await client.query('COMMIT');
    // Statistics for the planner, as after a real load (§11).
    await client.query('VACUUM (ANALYZE) workout_entries');
    await client.query('VACUUM (ANALYZE) workout_sets');

    const by = (grp: string) => counts.find((c) => c.grp === grp);
    return {
      heavyEntries: Number(by('heavy')?.entries ?? 0),
      heavySets: Number(by('heavy')?.sets ?? 0),
      singleEntries: Number(by('single')?.entries ?? 0),
      singleSets: Number(by('single')?.sets ?? 0),
      backgroundUsers: Number(by('background')?.users ?? 0),
      backgroundEntries: Number(by('background')?.entries ?? 0),
      backgroundSets: Number(by('background')?.sets ?? 0),
      elapsedMs: performance.now() - started,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

// The second benchmark pass (§11): fresh inserts for the heavy user, newer
// than everything loaded, written in one statement per table and followed by
// no VACUUM, so the planner and the visibility map are as stale as they are
// after a busy day. The shape is the data's: sessions of 8 entries that share
// one instant (one local morning each, a day after the last), exercises drawn
// from the heavy user's own vocabulary and skewed to its most-trained, three
// or four sets of 5 reps at a weight in 2.5 kg steps. Rows from an earlier
// call are removed first, so a run can be repeated.
const FRESH_SESSION_SIZE = 8;

export async function removeFreshHeavyEntries(client: Client): Promise<void> {
  await client.query(
    `DELETE FROM workout_entries
      WHERE user_id = $1 AND performed_at > $2::timestamptz + interval '12 hours'`,
    [HEAVY_USER, BENCH_ANCHOR],
  );
}

export async function insertFreshHeavyEntries(
  databaseUrl: string,
  count: number,
): Promise<number> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await removeFreshHeavyEntries(client);
    await client.query(
      `CREATE TEMP TABLE bench_fresh ON COMMIT DROP AS
       WITH vocab AS (
         SELECT array_agg(exercise_key ORDER BY n DESC, exercise_key) AS keys
           FROM (SELECT exercise_key, count(*) AS n FROM workout_entries
                  WHERE user_id = $1 GROUP BY exercise_key) t
       )
       SELECT uuidv7() AS id, f.i, f.performed_at,
              v.keys[f.pick] AS exercise_key,
              (3 + f.i % 2) AS nsets
         FROM (
           SELECT i,
                  $2::timestamptz + make_interval(
                    mins => ((i / $4::int) + 1) * 1440 + (6 + (i / $4::int) % 3) * 60
                            + ((i / $4::int) * 7) % 60 - 420) AS performed_at,
                  1 + floor(array_length(vocab.keys, 1)
                            * power(((i::bigint * 2654435761) % 1000003) / 1000003.0, 3))::int AS pick
             FROM generate_series(0, $3::int - 1) AS i, vocab
         ) f, vocab v
        ORDER BY f.performed_at, f.i`,
      [HEAVY_USER, BENCH_ANCHOR, count, FRESH_SESSION_SIZE],
    );
    await client.query(
      `INSERT INTO workout_entries
         (id, user_id, exercise_name, exercise_key, performed_at, utc_offset_minutes)
       SELECT b.id, $1, coalesce(x.name, b.exercise_key), b.exercise_key,
              b.performed_at, 420
         FROM bench_fresh b
         LEFT JOIN exercises x ON x.exercise_key = b.exercise_key
        ORDER BY b.performed_at, b.i`,
      [HEAVY_USER],
    );
    await client.query(
      `INSERT INTO workout_sets (entry_id, set_number, reps, weight, unit, weight_kg)
       SELECT b.id, k, 5, 2.5 * (20 + (b.i + k) % 20), 'kg', 2.5 * (20 + (b.i + k) % 20)
         FROM bench_fresh b CROSS JOIN LATERAL generate_series(1, b.nsets) AS k
        ORDER BY b.id, k`,
    );
    await client.query('COMMIT');
    return count;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const scale = Number(process.env.BENCH_SCALE ?? '1');
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('BENCH_SCALE must be a positive number');
  }
  const r = await generateBenchData(databaseUrl, scale);
  console.log(`bench:data scale ${scale}`);
  console.log(
    `  ${HEAVY_USER}: ${r.heavyEntries} entries, ${r.heavySets} sets`,
  );
  console.log(
    `  ${SINGLE_USER}: ${r.singleEntries} entries, ${r.singleSets} sets`,
  );
  console.log(
    `  ${BG_PREFIX}*: ${r.backgroundUsers} users, ${r.backgroundEntries} entries, ${r.backgroundSets} sets`,
  );
  console.log(`  done in ${(r.elapsedMs / 1000).toFixed(1)} s`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    // The message never carries the database URL (pg errors name the host only).
    console.error(
      'bench:data failed:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
