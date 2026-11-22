import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { ApiEnv } from '../src/config/env';
import { SHAPE_MESSAGES } from '../src/workouts/dto/entry-input.dto';
import { WorkoutsRepository } from '../src/workouts/workouts.repository';
import { createTestApp } from './support/app';
import { query } from './support/database';
import {
  entryBody,
  NOW,
  PROBLEM_JSON,
  rowsFor,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

// The number of different writes the concurrency test sends at once.
const BURST = 8;

// Bulk logging and concurrency (design §9.1, §9.5; §12, the bulk and
// concurrency row).
describe('log entries in bulk (design §9.1, §9.5)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const postBulk = (userId: string, body: unknown) =>
    http()
      .post(`/v1/users/${userId}/workout-entries/bulk`)
      .send(body as object);

  // An entry of one set, so each request of a test can be told apart.
  const oneSet = (reps: number, weight: number, unit = 'kg') =>
    entryBody({ sets: [{ reps, weight, unit }] });

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  it('one bad entry → 400 and 0 rows', async () => {
    const userId = uniqueUserId();
    const res = withStatus(
      await postBulk(userId, {
        entries: [entryBody(), oneSet(5, 100, 'stone'), entryBody()],
      }),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      {
        path: 'entries[1].sets[0].unit',
        message:
          "Unsupported unit 'stone'. Supported units: kg (kgs), lb (lbs).",
      },
    ]);
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
  });

  it('three faults in three items → one 400 with entries[0].sets[0].unit, entries[1].date, entries[2].userId; 0 rows', async () => {
    const userId = uniqueUserId();
    const other = uniqueUserId();
    const res = withStatus(
      await postBulk(userId, {
        entries: [
          oneSet(5, 100, 'stone'),
          entryBody({ date: '2025-02-10T06:30:00' }),
          entryBody({ userId: other }),
        ],
      }),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      {
        path: 'entries[0].sets[0].unit',
        message:
          "Unsupported unit 'stone'. Supported units: kg (kgs), lb (lbs).",
      },
      {
        path: 'entries[1].date',
        message:
          "'2025-02-10T06:30:00' has no UTC offset, so the moment it names is unknown. " +
          'Add your UTC offset, for example 2025-02-10T06:30:00+07:00. ' +
          'Z means UTC, not your local time.',
      },
      {
        path: 'entries[2].userId',
        message: `'${other}' does not match the userId in the path, '${userId}'.`,
      },
    ]);
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
    expect(await rowsFor(other)).toEqual({ entries: 0, sets: 0 });
  });

  it('returns entries in the order sent', async () => {
    const userId = uniqueUserId();
    // Neither alphabetical nor chronological, so no sort can pass for the
    // order sent.
    const sent = [
      { exerciseName: 'Squat', date: '2025-02-10T07:00:00+07:00' },
      { exerciseName: 'Bench Press', date: '2025-02-10T05:30:00+07:00' },
      { exerciseName: 'Deadlift', date: '2025-02-10T06:15:00+07:00' },
    ];
    const res = withStatus(
      await postBulk(userId, { entries: sent.map((s) => entryBody(s)) }),
      201,
    );
    expect(res.headers.location).toBeUndefined();
    const data = res.body.data as { id: string; exerciseName: string }[];
    expect(data.map((e) => e.exerciseName)).toEqual([
      'Squat',
      'Bench Press',
      'Deadlift',
    ]);
    expect(new Set(data.map((e) => e.id)).size).toBe(sent.length);
    // Each item is the entry exactly as a later read returns it.
    for (const entry of data) {
      const read = await http()
        .get(`/v1/users/${userId}/workout-entries/${entry.id}`)
        .expect(200);
      expect(read.body.data).toEqual(entry);
    }
    expect(await rowsFor(userId)).toEqual({ entries: 3, sets: 6 });
  });

  it(`${BURST} different concurrent writes for one user and exercise (below the pool size) → all stored, sets intact`, async () => {
    const poolMax = app
      .get<ConfigService<ApiEnv, true>>(ConfigService)
      .get('DB_POOL_MAX', { infer: true });
    expect(BURST).toBeLessThan(poolMax);
    const userId = uniqueUserId();
    // Bench Press each time; request i sends two sets of its own weights and
    // reps, on 2.5 kg plate steps.
    const bodies = Array.from({ length: BURST }, (_, i) => ({
      entries: [
        entryBody({
          sets: [
            { reps: 5, weight: 100 + 2.5 * i, unit: 'kg' },
            { reps: 3 + i, weight: 200 + 5 * i, unit: 'lb' },
          ],
        }),
      ],
    }));
    const responses = await Promise.all(
      bodies.map((body) => postBulk(userId, body)),
    );
    responses.forEach((res, i) => {
      withStatus(res, 201);
      expect(
        res.body.data[0].sets.map((s: { reps: number; original: unknown }) => [
          s.reps,
          s.original,
        ]),
      ).toEqual([
        [5, { weight: 100 + 2.5 * i, unit: 'kg' }],
        [3 + i, { weight: 200 + 5 * i, unit: 'lb' }],
      ]);
    });
    expect(await rowsFor(userId)).toEqual({ entries: BURST, sets: 2 * BURST });
    // In the database, each entry holds its own two sets and nothing else.
    const stored = await query<{ id: string; sets: string }>(
      `SELECT e.id,
              string_agg(s.set_number || ':' || s.reps || ':' || s.weight::text
                         || ':' || s.unit, ',' ORDER BY s.set_number) AS sets
         FROM workout_entries e JOIN workout_sets s ON s.entry_id = e.id
        WHERE e.user_id = $1 GROUP BY e.id`,
      [userId],
    );
    const setsById = new Map(stored.map((row) => [row.id, row.sets]));
    responses.forEach((res, i) => {
      expect(setsById.get(res.body.data[0].id)).toBe(
        `1:5:${(100 + 2.5 * i).toFixed(3)}:kg,` +
          `2:${3 + i}:${(200 + 5 * i).toFixed(3)}:lb`,
      );
    });
  });

  it('two identical requests → two entries', async () => {
    const userId = uniqueUserId();
    const body = { entries: [entryBody()] };
    const [first, second] = await Promise.all([
      postBulk(userId, body),
      postBulk(userId, body),
    ]);
    withStatus(first, 201);
    withStatus(second, 201);
    expect(first.body.data[0].id).not.toBe(second.body.data[0].id);
    expect(await rowsFor(userId)).toEqual({ entries: 2, sets: 4 });
  });

  it('101 entries → 400 on entries; a bulk item userId equal to the path → 201', async () => {
    const userId = uniqueUserId();
    const over = withStatus(
      await postBulk(userId, {
        entries: Array.from({ length: 101 }, () => oneSet(5, 100)),
      }),
      400,
    );
    expect(over.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(over.body.errors).toEqual([
      { path: 'entries', message: SHAPE_MESSAGES.entries },
    ]);
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });

    const same = withStatus(
      await postBulk(userId, { entries: [entryBody({ userId })] }),
      201,
    );
    expect(same.body.data[0].userId).toBe(userId);
    expect(await rowsFor(userId)).toEqual({ entries: 1, sets: 2 });
  });

  // Controller ruling 1: the read-back keeps the order of the ids it is given.
  it('findEntriesByIds returns the entries in the order of the ids, each with its sets', async () => {
    const userId = uniqueUserId();
    const res = withStatus(
      await postBulk(userId, {
        entries: [oneSet(5, 100), oneSet(3, 110), entryBody()],
      }),
      201,
    );
    const ids = (res.body.data as { id: string }[]).map((e) => e.id);
    const reversed = [...ids].reverse();
    const found = await app.get(WorkoutsRepository).findEntriesByIds(reversed);
    expect(found.map((e) => e.id)).toEqual(reversed);
    expect(found.map((e) => e.sets.map((s) => [s.setNumber, s.reps]))).toEqual([
      [
        [1, 5],
        [2, 3],
      ],
      [[1, 3]],
      [[1, 5]],
    ]);
    expect(await app.get(WorkoutsRepository).findEntriesByIds([])).toEqual([]);
  });
});
