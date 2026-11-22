import { Pool } from 'pg';
import request from 'supertest';
import { v7 } from 'uuid';
import { createTestApp } from './support/app';

// Stands in for the pool when the database is unreachable.
const failingPool = () => ({
  query: () => Promise.reject(new Error('database unreachable')),
  end: () => Promise.resolve(),
});

describe('toolchain', () => {
  it('imports v7 from the ESM-only uuid 14', () =>
    expect(v7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/));

  it('answers /health/ready through Nest from the Testcontainers database', async () =>
    request((await createTestApp()).getHttpServer())
      .get('/health/ready')
      .expect(200));

  it('answers /health/live without the database', async () =>
    request(
      (
        await createTestApp({
          // A pool whose every query fails: live must not touch the database.
          providers: [{ provide: Pool, useValue: failingPool() }],
        })
      ).getHttpServer(),
    )
      .get('/health/live')
      .expect(200));

  it('runs in the non-UTC process zone', () =>
    // Node reports Asia/Saigon for this TZ
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toMatch(
      /Asia\/(Ho_Chi_Minh|Saigon)/,
    ));
});
