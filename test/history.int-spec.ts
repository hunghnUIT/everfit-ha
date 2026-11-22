import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import {
  EXERCISE_CATALOG,
  type ExerciseCatalog,
} from '../src/exercises/exercise-catalog';
import { createTestApp } from './support/app';
import { query } from './support/database';
import {
  entryBody,
  NOW,
  postEntry,
  PROBLEM_JSON,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

const EMPTY_MESSAGE = 'No workout entries found for the given filters.';

// The history endpoint (design §9.2; §12, the endpoint E-cases and the first
// request).
describe('history (design §9.2)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const history = (userId: string, qs = '') =>
    http().get(`/v1/users/${userId}/workout-entries${qs}`);

  // Logs one entry and returns its id.
  async function log(
    userId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = withStatus(
      await postEntry(app, userId, entryBody(overrides)),
      201,
    );
    return res.body.data.id as string;
  }

  const ids = (res: request.Response) =>
    (res.body.data as { id: string }[]).map((entry) => entry.id);

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  describe('date bounds', () => {
    const userId = uniqueUserId();
    // D lies after 2025-02-01T00:00:00+07:00 (17:00Z) and before midnight UTC,
    // so only a + read as an offset includes it.
    const entries: Record<'d' | 'a' | 'b' | 'c', string> = {
      d: '',
      a: '',
      b: '',
      c: '',
    };

    beforeAll(async () => {
      entries.d = await log(userId, { date: '2025-01-31T18:00:00Z' });
      entries.a = await log(userId, { date: '2025-02-01T10:00:00Z' });
      entries.b = await log(userId, { date: '2025-02-05T10:00:00Z' });
      entries.c = await log(userId, { date: '2025-02-09T10:00:00Z' });
    });

    const cases: [string, string, ('a' | 'b' | 'c' | 'd')[]][] = [
      ['from alone', '?from=2025-02-03T00:00:00Z', ['c', 'b']],
      ['to alone', '?to=2025-02-03T00:00:00Z', ['a', 'd']],
      ['both', '?from=2025-02-03T00:00:00Z&to=2025-02-07T00:00:00Z', ['b']],
      ['neither', '', ['c', 'b', 'a', 'd']],
    ];
    it.each(cases)('%s', async (_name, qs, expected) => {
      const res = withStatus(await history(userId, qs), 200);
      expect(ids(res)).toEqual(expected.map((k) => entries[k]));
      expect(res.body.page).toEqual({
        limit: 20,
        hasMore: false,
        nextCursor: null,
      });
      expect(res.body).not.toHaveProperty('message');
    });

    // the first-request row
    it('?from=2025-02-01T00:00:00+07:00 with the + unencoded → 200', async () => {
      const res = withStatus(
        await history(userId, '?from=2025-02-01T00:00:00+07:00'),
        200,
      );
      expect(ids(res)).toEqual([entries.c, entries.b, entries.a, entries.d]);
    });
  });

  it('converts units on read; a set read in its own unit returns the number as sent', async () => {
    const userId = uniqueUserId();
    await log(userId);
    const inKg = withStatus(await history(userId), 200).body.data[0];
    expect(inKg.sets.map((s: { weight: number }) => s.weight)).toEqual([
      102.06, 105,
    ]);
    const inLb = withStatus(await history(userId, '?unit=LBS'), 200).body
      .data[0];
    expect(inLb.sets).toEqual([
      {
        setNumber: 1,
        reps: 5,
        weight: 225,
        unit: 'lb',
        original: { weight: 225, unit: 'lb' },
      },
      {
        setNumber: 2,
        reps: 3,
        weight: 231.49,
        unit: 'lb',
        original: { weight: 105, unit: 'kg' },
      },
    ]);
  });

  it('the muscle-group filter, including an exercise not in the catalog', async () => {
    const userId = uniqueUserId();
    const bench = await log(userId, { exerciseName: 'Bench Press' });
    const squat = await log(userId, { exerciseName: 'Squat' });
    const unknown = await log(userId, { exerciseName: 'Zercher Hold' });

    const chest = withStatus(
      await history(userId, '?muscleGroup=%20Chest'),
      200,
    );
    expect(ids(chest)).toEqual([bench]);
    expect(chest.body.data[0].muscleGroups).toEqual([
      'chest',
      'shoulders',
      'triceps',
    ]);

    // Not in the catalog: listed with no groups, and matched by no group.
    const all = withStatus(await history(userId), 200);
    expect(ids(all)).toEqual([unknown, squat, bench]);
    expect(all.body.data[0].muscleGroups).toEqual([]);
    for (const group of ['chest', 'quads', 'glutes', 'back']) {
      const res = withStatus(
        await history(userId, `?muscleGroup=${group}`),
        200,
      );
      expect(ids(res)).not.toContain(unknown);
    }

    const unknownGroup = withStatus(
      await history(userId, '?muscleGroup=neck'),
      400,
    );
    expect(unknownGroup.body.errors).toEqual([
      {
        path: 'muscleGroup',
        message: expect.stringMatching(
          /^Unknown muscle group 'neck'\. Known muscle groups: abs, back, .*triceps\.$/,
        ),
      },
    ]);
  });

  it('a known group with no exercises → empty 200 with the message', async () => {
    const userId = uniqueUserId();
    await log(userId);
    await query(`INSERT INTO muscle_groups (name) VALUES ('rotator cuff')`);
    await app.get<ExerciseCatalog>(EXERCISE_CATALOG).refresh();
    const res = withStatus(
      await history(userId, '?muscleGroup=rotator%20cuff'),
      200,
    );
    expect(res.body).toEqual({
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
      message: EMPTY_MESSAGE,
    });
  });

  it('a partial term containing % or _ matches literally', async () => {
    const userId = uniqueUserId();
    const percent = await log(userId, { exerciseName: 'Row 100%' });
    await log(userId, { exerciseName: 'Row 1000' });
    const underscore = await log(userId, { exerciseName: 'Cable_Fly' });
    await log(userId, { exerciseName: 'Cable Fly' });

    // Unescaped, '0%' would match any name containing 0, and 'e_f' 'cable fly'.
    expect(
      ids(withStatus(await history(userId, '?exercise=0%25'), 200)),
    ).toEqual([percent]);
    expect(
      ids(withStatus(await history(userId, '?exercise=E_F'), 200)),
    ).toEqual([underscore]);
  });

  // Review Focus 4
  it('an empty range → 200 with the message; a well-formed unknown user → 200 empty', async () => {
    const userId = uniqueUserId();
    await log(userId);
    const empty = {
      data: [],
      page: { limit: 20, hasMore: false, nextCursor: null },
      message: EMPTY_MESSAGE,
    };
    const range = withStatus(
      await history(userId, '?from=2025-03-01T00:00:00Z'),
      200,
    );
    expect(range.body).toEqual(empty);
    const nobody = withStatus(await history(uniqueUserId('nobody')), 200);
    expect(nobody.body).toEqual(empty);
  });

  // Review Focus 4
  it.each(['coach%40example.com', 'user%3A1', 'u%201'])(
    'path userId %s → 400 naming userId',
    async (encoded) => {
      const res = withStatus(
        await http().get(`/v1/users/${encoded}/workout-entries`),
        400,
      );
      expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(res.body.errors).toEqual([
        { path: 'userId', message: expect.any(String) },
      ]);
    },
  );

  it('?exerciseName=bench → 400 naming exerciseName', async () => {
    const res = withStatus(
      await history(uniqueUserId(), '?exerciseName=bench'),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      {
        path: 'exerciseName',
        message:
          "Unknown query parameter 'exerciseName'. Accepted parameters: exercise, muscleGroup, from, to, unit, limit, cursor.",
      },
    ]);
  });

  it('two entries with one date in one bulk come back newest id first over two pages of size one, each with its own sets', async () => {
    const userId = uniqueUserId();
    const date = '2025-02-10T05:30:00+07:00';
    const bulk = withStatus(
      await http()
        .post(`/v1/users/${userId}/workout-entries/bulk`)
        .send({
          entries: [
            {
              date,
              exerciseName: 'Squat',
              sets: [{ reps: 5, weight: 140, unit: 'kg' }],
            },
            {
              date,
              exerciseName: 'Bench Press',
              sets: [
                { reps: 8, weight: 80, unit: 'kg' },
                { reps: 6, weight: 85, unit: 'kg' },
              ],
            },
          ],
        }),
      201,
    );
    const [first, second] = bulk.body.data as { id: string; sets: unknown[] }[];
    expect(
      bulk.body.data.map((e: { exerciseName: string }) => e.exerciseName),
    ).toEqual(['Squat', 'Bench Press']);

    const page1 = withStatus(await history(userId, '?limit=1'), 200);
    expect(ids(page1)).toEqual([second.id]);
    expect(page1.body.data[0].sets).toEqual(second.sets);
    expect(page1.body.page).toEqual({
      limit: 1,
      hasMore: true,
      nextCursor: expect.any(String),
    });

    const page2 = withStatus(
      await history(
        userId,
        `?limit=1&cursor=${encodeURIComponent(page1.body.page.nextCursor)}`,
      ),
      200,
    );
    expect(ids(page2)).toEqual([first.id]);
    expect(page2.body.data[0].sets).toEqual(first.sets);
    expect(page2.body.page).toEqual({
      limit: 1,
      hasMore: false,
      nextCursor: null,
    });
  });
});
