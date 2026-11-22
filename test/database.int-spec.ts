import { INestApplication, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import get from 'lodash/get';
import { Pool } from 'pg';
import { v7 } from 'uuid';
import { workoutEntries } from '../src/database/schema';
import { pgArray, toDate } from '../src/database/sql';
import { Database, DB, PG_POOL } from '../src/database/tokens';
import { createTestApp } from './support/app';
import { query } from './support/database';

const URL_TEXT = process.env.DATABASE_URL ?? '';
const DRIVER_MESSAGE = 'terminating connection due to administrator command';

// The warn lines the Database logger writes, recorded at its Nest Logger: the
// harness mutes the real output (LOG_LEVEL=fatal).
function recordDatabaseWarnings(): unknown[][] {
  const warnings: unknown[][] = [];
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(function (
    this: Logger,
    ...args: unknown[]
  ) {
    if (get(this, 'context') === 'Database') warnings.push(args);
  });
  return warnings;
}

// No line carries the URL, its password or the driver's message.
function expectNoSecrets(warnings: unknown[][]): void {
  const written = JSON.stringify(warnings);
  expect(written).not.toContain(new URL(URL_TEXT).host);
  expect(written).not.toContain(`:${new URL(URL_TEXT).password}@`);
  expect(written).not.toContain(DRIVER_MESSAGE);
}

// Polls a condition for up to five seconds.
async function until(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(condition()).toBe(true);
}

describe('database', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<Database>(DB);
  });

  afterEach(() => jest.restoreAllMocks());

  it('PG_POOL holds DB_POOL_MAX connections and the statement timeout', async () => {
    const pool = app.get<Pool>(PG_POOL);
    expect(pool.options.max).toBe(10);
    const { rows } = await pool.query('SHOW statement_timeout');
    expect(rows).toEqual([{ statement_timeout: '5s' }]);
  });

  it('pgArray binds one array parameter', async () => {
    const texts = pgArray(['a', 'b'], 'text');
    expect(new PgDialect().sqlToQuery(sql`${texts}`).params).toEqual([
      ['a', 'b'],
    ]);
    const hit = (condition: ReturnType<typeof sql>) =>
      db
        .execute<{ hit: boolean }>(sql`SELECT ${condition} AS hit`)
        .then((result) => result.rows[0].hit);

    await expect(hit(sql`'b' = ANY(${texts})`)).resolves.toBe(true);
    await expect(hit(sql`'c' = ANY(${texts})`)).resolves.toBe(false);

    const [first, second, other] = [v7(), v7(), v7()];
    const ids = pgArray([first, second], 'uuid');
    await expect(hit(sql`${second}::uuid = ANY(${ids})`)).resolves.toBe(true);
    await expect(hit(sql`${other}::uuid = ANY(${ids})`)).resolves.toBe(false);
  });

  it('toDate reads a timestamptz from db.execute as the stored instant', async () => {
    const id = v7();
    await db.insert(workoutEntries).values({
      id,
      userId: 'user-1',
      exerciseName: 'Bench Press',
      exerciseKey: 'bench press',
      performedAt: new Date('2025-02-10T09:00:00.123Z'),
      utcOffsetMinutes: 420,
    });
    const { rows } = await db.execute<{ performed_at: Date | string }>(
      sql`SELECT performed_at FROM workout_entries WHERE id = ${id}`,
    );
    // Drizzle hands timestamptz over as text, in the session zone.
    expect(rows[0].performed_at).toBe('2025-02-10 01:00:00.123-08');
    expect(toDate(rows[0].performed_at).toISOString()).toBe(
      '2025-02-10T09:00:00.123Z',
    );
  });

  it('a pool-level error (an idle client) is handled without a line of its own and does not throw', () => {
    const warnings = recordDatabaseWarnings();
    const pool = app.get<Pool>(PG_POOL);
    const error = Object.assign(
      new Error('terminating connection due to administrator command'),
      { code: '57P01' },
    );

    expect(() => pool.emit('error', error)).not.toThrow();

    // The client's own listener writes the one line for this failure.
    expect(warnings).toEqual([]);
  });

  it('a connection in use that fails logs one warn line with the code and name only, and does not throw', async () => {
    // pg-pool removes its own error listener when it hands a client out, so
    // without one of the app's, a lost connection mid-query is an unhandled
    // 'error' event that ends the process.
    const warnings = recordDatabaseWarnings();
    const pool = app.get<Pool>(PG_POOL);
    const error = Object.assign(new Error(`${DRIVER_MESSAGE} ${URL_TEXT}`), {
      code: '57P01',
    });
    const client = await pool.connect();
    try {
      expect(client.listenerCount('error')).toBeGreaterThan(0);
      expect(() => client.emit('error', error)).not.toThrow();
    } finally {
      client.release(true);
    }

    expect(warnings).toEqual([
      [{ code: '57P01', name: 'Error' }, 'Database connection failed'],
    ]);
    expectNoSecrets(warnings);
  });

  it('an idle connection whose backend is terminated logs exactly one warn line, code 57P01', async () => {
    const warnings = recordDatabaseWarnings();
    const pool = app.get<Pool>(PG_POOL);
    // The client that answers goes back to the pool idle.
    const { rows } = await pool.query<{ pid: number }>(
      'SELECT pg_backend_pid() AS pid',
    );
    const before = pool.totalCount;
    await query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
    await until(() => pool.totalCount < before);
    // Long enough for a second listener's line, if there were one.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(warnings).toEqual([
      [{ code: '57P01', name: 'error' }, 'Database connection failed'],
    ]);
    expectNoSecrets(warnings);
  });
});
