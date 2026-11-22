import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

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
