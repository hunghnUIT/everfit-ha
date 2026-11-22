import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { createTestApp } from './support/app';
import { query } from './support/database';
import {
  entryBody,
  NOW,
  postEntry,
  PROBLEM_JSON,
  rowsFor,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

// Inputs that passed validation and reached PostgreSQL, which refused them
// with a 500 (final review B1, B2): the NUL character, which a text column
// cannot hold; an instant past year 9999, which toISOString prints with six
// digits; and an exercise term that is blank once normalised. Each is now
// answered before any statement runs (design §10.1).

const NUL_NAME = 'Bench\u0000Press';
const NUL_QUERY = 'Bench%00Press';
const NUL_ENTRY_MESSAGE = 'The name must not contain the NUL character.';
const NUL_TERM_MESSAGE = 'exercise must not contain the NUL character.';
const BLANK_TERM_MESSAGE = 'exercise must not be blank.';

const CURSOR_MESSAGE =
  'cursor is not one this API issued. Send the nextCursor of the previous ' +
  'page unchanged, or leave cursor out for the first page.';

// A valid compare query with any parameter replaced.
function compareQuery(overrides: Record<string, string> = {}): string {
  const params = {
    exercise: 'Bench%20Press',
    from: '2025-02-01T00:00:00Z',
    to: '2025-03-01T00:00:00Z',
    compareFrom: '2025-01-01T00:00:00Z',
    compareTo: '2025-02-01T00:00:00Z',
    ...overrides,
  };
  return Object.entries(params)
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

// A cursor as the API encodes one, with the `at` given.
function cursorAt(at: string): string {
  const json = JSON.stringify({
    v: 1,
    at,
    id: '0194f2fe-6c3a-7b1d-9a2e-4f5d6c7b8a90',
  });
  return Buffer.from(json, 'utf8').toString('base64url');
}

// The three catalog tables, counted: "nothing written" for the admin routes.
async function catalogCounts() {
  const [counts] = await query<{ e: number; g: number; l: number }>(
    `SELECT (SELECT count(*)::int FROM exercises) AS e,
            (SELECT count(*)::int FROM muscle_groups) AS g,
            (SELECT count(*)::int FROM exercise_muscle_groups) AS l`,
  );
  return counts;
}

describe('inputs PostgreSQL would refuse (final review B1, B2)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  describe('NUL in an exercise name or term → 400 on the field', () => {
    it.each([
      ['POST …/workout-entries', 'exerciseName', 'one'],
      ['POST …/workout-entries/bulk', 'entries[0].exerciseName', 'bulk'],
    ] as const)('%s → 400 on %s, nothing written', async (_, path, kind) => {
      const userId = uniqueUserId();
      const body = entryBody({ exerciseName: NUL_NAME });
      const res =
        kind === 'one'
          ? await postEntry(app, userId, body)
          : await http()
              .post(`/v1/users/${userId}/workout-entries/bulk`)
              .send({ entries: [body] });
      withStatus(res, 400);
      expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(res.body.errors).toEqual([{ path, message: NUL_ENTRY_MESSAGE }]);
      expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
    });

    it.each([
      ['history', `workout-entries?exercise=${NUL_QUERY}`],
      ['PRs', `personal-records?exercise=${NUL_QUERY}`],
      [
        'compare',
        `personal-records/compare?${compareQuery({ exercise: NUL_QUERY })}`,
      ],
    ])('GET %s → 400 on exercise', async (_, route) => {
      const res = await http().get(`/v1/users/${uniqueUserId()}/${route}`);
      withStatus(res, 400);
      expect(res.body.errors).toEqual([
        { path: 'exercise', message: NUL_TERM_MESSAGE },
      ]);
    });

    it('POST /v1/admin/exercises → 400 on name, nothing written', async () => {
      const before = await catalogCounts();
      const res = await http()
        .post('/v1/admin/exercises')
        .send({ name: NUL_NAME, muscleGroups: ['chest'] });
      withStatus(res, 400);
      expect(res.body.errors).toEqual([
        { path: 'name', message: NUL_ENTRY_MESSAGE },
      ]);
      expect(await catalogCounts()).toEqual(before);
    });
  });

  describe('NUL in a catalog path value → the route’s 404', () => {
    it('GET /v1/exercises/{NUL} → 404', async () => {
      const res = await http().get(`/v1/exercises/${NUL_QUERY}`);
      withStatus(res, 404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it.each([
      ['put', `/v1/admin/exercises/${NUL_QUERY}`],
      ['delete', `/v1/admin/exercises/${NUL_QUERY}`],
      ['delete', '/v1/admin/muscle-groups/chest%00'],
    ] as const)('%s %s → 404, nothing written', async (method, path) => {
      const before = await catalogCounts();
      // The body's name matches the path, so only the path can refuse it.
      const res = await http()
        [method](path)
        .send({ name: NUL_NAME, muscleGroups: ['chest'] });
      withStatus(res, 404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(await catalogCounts()).toEqual(before);
    });
  });

  describe('a read bound past year 9999 → 400 on the bound', () => {
    const LATE_MESSAGE = (raw: string) =>
      `'${raw}' is after 9999-12-31T23:59:59.999Z, the latest moment ` +
      'accepted. Check the year.';

    // Year 10000 written out, and a value that rounds up to it.
    it.each([
      ['+010000-01-01T00:00:00Z', '%2B010000-01-01T00:00:00Z'],
      ['9999-12-31T23:59:59.9995Z', '9999-12-31T23:59:59.9995Z'],
    ])('to=%s on history, PRs and compare → 400 on to', async (raw, sent) => {
      const userId = uniqueUserId();
      for (const route of [
        `workout-entries?to=${sent}`,
        `personal-records?exercise=Bench%20Press&to=${sent}`,
        `personal-records/compare?${compareQuery({ to: sent })}`,
      ]) {
        const res = await http().get(`/v1/users/${userId}/${route}`);
        withStatus(res, 400);
        expect(res.body.errors).toEqual([
          { path: 'to', message: LATE_MESSAGE(raw) },
        ]);
      }
    });

    it('to=9999-12-31T23:59:59.999Z, the last moment, is accepted', async () => {
      const userId = uniqueUserId();
      withStatus(await postEntry(app, userId), 201);
      const res = await http().get(
        `/v1/users/${userId}/workout-entries?to=9999-12-31T23:59:59.999Z`,
      );
      withStatus(res, 200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('a hand-made cursor outside the accepted years → 400 on cursor', () => {
    it.each(['+010000-01-01T00:00:00Z', '-000001-01-01T00:00:00Z'])(
      'cursor at %s → 400 with the cursor message',
      async (at) => {
        const res = await http().get(
          `/v1/users/${uniqueUserId()}/workout-entries?cursor=${cursorAt(at)}`,
        );
        withStatus(res, 400);
        expect(res.body.errors).toEqual([
          { path: 'cursor', message: CURSOR_MESSAGE },
        ]);
      },
    );
  });

  describe('a whitespace-only exercise → 400 on exercise (B2)', () => {
    it.each([
      ['history', 'workout-entries?exercise=%20'],
      ['PRs', 'personal-records?exercise=%20%20'],
      [
        'compare',
        `personal-records/compare?${compareQuery({ exercise: '%20' })}`,
      ],
    ])('GET %s → 400, not an unfiltered answer', async (_, route) => {
      const userId = uniqueUserId();
      withStatus(await postEntry(app, userId), 201);
      const res = await http().get(`/v1/users/${userId}/${route}`);
      withStatus(res, 400);
      expect(res.body.errors).toEqual([
        { path: 'exercise', message: BLANK_TERM_MESSAGE },
      ]);
    });
  });
});
