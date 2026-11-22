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

  it('an idle connection error logs one warn line with the code only', () => {
    const warnings: unknown[][] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(function (
      this: Logger,
      ...args: unknown[]
    ) {
      if (get(this, 'context') === 'Database') warnings.push(args);
    });
    const pool = app.get<Pool>(PG_POOL);
    const url = process.env.DATABASE_URL ?? '';
    const error = Object.assign(
      new Error(`terminating connection due to administrator command ${url}`),
      { code: '57P01' },
    );

    expect(() => pool.emit('error', error)).not.toThrow();

    expect(warnings).toEqual([
      [{ code: '57P01' }, 'Idle database connection failed'],
    ]);
    expect(JSON.stringify(warnings)).not.toContain(new URL(url).host);
  });

  it('a connection in use that fails logs one warn line with the code and name only, and does not throw', async () => {
    // pg-pool removes its own error listener when it hands a client out, so
    // without one of the app's, a lost connection mid-query is an unhandled
    // 'error' event that ends the process.
    const warnings: unknown[][] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(function (
      this: Logger,
      ...args: unknown[]
    ) {
      if (get(this, 'context') === 'Database') warnings.push(args);
    });
    const pool = app.get<Pool>(PG_POOL);
    const url = process.env.DATABASE_URL ?? '';
    const error = Object.assign(
      new Error(`Connection terminated unexpectedly ${url}`),
      { code: '57P01' },
    );
    const client = await pool.connect();
    try {
      expect(client.listenerCount('error')).toBeGreaterThan(0);
      expect(() => client.emit('error', error)).not.toThrow();
    } finally {
      client.release(true);
    }

    expect(warnings).toEqual([
      [
        { code: '57P01', name: 'Error' },
        'Database connection failed while in use',
      ],
    ]);
    expect(JSON.stringify(warnings)).not.toContain(new URL(url).host);
  });
});
