import { Pool } from 'pg';
import request from 'supertest';
import { PG_POOL } from '../src/database/tokens';
import { PgCatalogLoader } from '../src/exercises/catalog-loader';
import { createTestApp } from './support/app';

describe('health', () => {
  it('/health/ready with an unreachable database → 503 application/problem+json, SERVICE_UNAVAILABLE', async () => {
    const app = await createTestApp({
      providers: [
        {
          provide: PG_POOL,
          // Nothing listens on port 1: every connection is refused.
          useValue: new Pool({
            connectionString: 'postgres://workout:workout@127.0.0.1:1/workout',
          }),
        },
        // The pool override models a database lost after boot; boot itself
        // needs a catalog load (design §10.2), so an empty catalog stands in.
        {
          provide: PgCatalogLoader,
          useValue: {
            load: () => Promise.resolve({ exercises: [], groups: [] }),
          },
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);

    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      instance: '/health/ready',
      requestId: expect.any(String),
    });
  });
});
