import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { query } from './database';

export const PROBLEM_JSON = /^application\/problem\+json/;

// The fixed "now" the plan's date tests use. Every sample date in the entry
// tests lies before it, and the write rule refuses a date more than 15
// minutes after it.
export const NOW = '2025-02-11T03:00:00Z';

// The response, after its status is checked; on a mismatch Jest shows the body.
export function withStatus(
  res: request.Response,
  status: number,
): request.Response {
  expect({ status: res.status, body: res.body }).toMatchObject({ status });
  return res;
}

// The rows stored for one user, in both tables: "nothing written" is checked
// in the database, not only by the status code.
export async function rowsFor(
  userId: string,
): Promise<{ entries: number; sets: number }> {
  const [counts] = await query<{ entries: number; sets: number }>(
    `SELECT (SELECT count(*)::int FROM workout_entries WHERE user_id = $1) AS entries,
            (SELECT count(*)::int FROM workout_sets s
               JOIN workout_entries e ON e.id = s.entry_id
              WHERE e.user_id = $1) AS sets`,
    [userId],
  );
  return counts;
}

// A userId no other test uses, so the tests of one file never see each
// other's rows. Eight hex characters keep it far inside the 64-character rule.
export function uniqueUserId(prefix = 'u'): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

// The request of design §9.1, with any field replaced or added.
export function entryBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    date: '2025-02-10T05:30:00+07:00',
    exerciseName: 'Bench Press',
    sets: [
      { reps: 5, weight: 225, unit: 'lbs' },
      { reps: 3, weight: 105, unit: 'kg' },
    ],
    ...overrides,
  };
}

// POSTs one entry for userId: the §9.1 request unless a body is given.
export function postEntry(
  app: INestApplication,
  userId: string,
  body: unknown = entryBody(),
): Promise<request.Response> {
  return request(app.getHttpServer())
    .post(`/v1/users/${userId}/workout-entries`)
    .send(body as object);
}
