import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { SHAPE_MESSAGES } from '../src/workouts/dto/entry-input.dto';
import { createTestApp } from './support/app';
import { query } from './support/database';
import { entryBody, postEntry, uniqueUserId } from './support/fixtures';

const PROBLEM_JSON = /^application\/problem\+json/;

// The design's fixed "now" (§8): the §9.1 sample is 4.5 hours before it.
const NOW = '2025-02-11T03:00:00Z';

// The response, after its status is checked; on a mismatch Jest shows the body.
function withStatus(res: request.Response, status: number) {
  expect({ status: res.status, body: res.body }).toMatchObject({ status });
  return res;
}

// The rows stored for one user, in both tables: "nothing written" is checked
// in the database, not only by the status code.
async function rowsFor(userId: string) {
  const [counts] = await query<{ entries: number; sets: number }>(
    `SELECT (SELECT count(*)::int FROM workout_entries WHERE user_id = $1) AS entries,
            (SELECT count(*)::int FROM workout_sets s
               JOIN workout_entries e ON e.id = s.entry_id
              WHERE e.user_id = $1) AS sets`,
    [userId],
  );
  return counts;
}

// The first request a reviewer sends (design §12, the first-request row).
describe('the first request', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const entriesPath = (userId: string) => `/v1/users/${userId}/workout-entries`;

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  it('body userId equal to the path → 201; different → 400 naming userId', async () => {
    const userId = uniqueUserId();
    const same = withStatus(
      await postEntry(app, userId, entryBody({ userId })),
      201,
    );
    expect(same.body.data.userId).toBe(userId);

    const other = uniqueUserId();
    const res = withStatus(
      await postEntry(app, other, entryBody({ userId })),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.errors).toEqual([
      {
        path: 'userId',
        message: `'${userId}' does not match the userId in the path, '${other}'.`,
      },
    ]);
    expect(await rowsFor(other)).toEqual({ entries: 0, sets: 0 });
  });

  it('"unit": "lbs" → 201; Content-Type application/json; charset=utf-8 → 201', async () => {
    const userId = uniqueUserId();
    const lbs = withStatus(
      await postEntry(
        app,
        userId,
        entryBody({ sets: [{ reps: 5, weight: 225, unit: 'lbs' }] }),
      ),
      201,
    );
    expect(lbs.body.data.sets[0].original).toEqual({ weight: 225, unit: 'lb' });

    const charset = await http()
      .post(entriesPath(userId))
      .set('Content-Type', 'application/json; charset=utf-8')
      .send(JSON.stringify(entryBody()))
      .expect(201);
    expect(charset.body.data.exerciseKey).toBe('bench press');
    expect(await rowsFor(userId)).toEqual({ entries: 2, sets: 3 });
  });

  it('a form-encoded body (curl -d, no header) → 415 naming the header to send', async () => {
    const userId = uniqueUserId();
    const res = await http()
      .post(entriesPath(userId))
      .type('form')
      .send('date=2025-02-10T05:30:00%2B07:00&exerciseName=Bench%20Press')
      .expect(415);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      detail: 'Send Content-Type: application/json',
    });
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
  });

  it('an array on the single route → 400 showing the expected shape', async () => {
    const userId = uniqueUserId();
    const res = withStatus(await postEntry(app, userId, [entryBody()]), 400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      { path: '', message: SHAPE_MESSAGES.singleBody },
    ]);
    expect(res.body.errors[0].message).toContain(
      '"exerciseName": "Bench Press"',
    );
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
  });

  it('a POST with the JSON header and no body → 400 showing the expected object; a bare null → 400 MALFORMED_JSON', async () => {
    const userId = uniqueUserId();
    const empty = await http()
      .post(entriesPath(userId))
      .set('Content-Type', 'application/json')
      .expect(400);
    expect(empty.body.code).toBe('VALIDATION_ERROR');
    expect(empty.body.errors).toEqual([
      { path: '', message: SHAPE_MESSAGES.singleBody },
    ]);

    const bareNull = await http()
      .post(entriesPath(userId))
      .set('Content-Type', 'application/json')
      .send('null')
      .expect(400);
    expect(bareNull.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(bareNull.body.code).toBe('MALFORMED_JSON');
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
  });

  it('"date": "2025-02-10" → 400 with the fix in its message, nothing written', async () => {
    const userId = uniqueUserId();
    const res = withStatus(
      await postEntry(app, userId, entryBody({ date: '2025-02-10' })),
      400,
    );
    expect(res.body.errors).toEqual([
      { path: 'date', message: expect.any(String) },
    ]);
    expect(res.body.errors[0].message).toContain('2025-02-10T09:00:00+07:00');
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
  });
});
