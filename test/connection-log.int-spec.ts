import { INestApplication } from '@nestjs/common';
import { PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import { Writable } from 'node:stream';
import { Pool } from 'pg';
import { CLOCK, fixedClock } from '../src/common/clock';
import { loggerParams } from '../src/common/logger';
import { PG_POOL } from '../src/database/tokens';
import { createTestApp } from './support/app';
import { query } from './support/database';
import { entryBody, NOW, postEntry, uniqueUserId } from './support/fixtures';

// The real log output, captured at warn. A file of its own: nestjs-pino's root
// logger is module state, set by the first app a file creates.
function memoryStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls a query until it returns a row, for up to five seconds.
async function firstRow<R extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<R> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await query<R>(text, values);
    if (row !== undefined) return row;
    await sleep(50);
  }
  throw new Error(`No row for ${text}`);
}

describe('a connection failure log line', () => {
  let app: INestApplication;
  const { lines, stream } = memoryStream();

  beforeAll(async () => {
    app = await createTestApp({
      providers: [
        { provide: CLOCK, useValue: fixedClock(NOW) },
        {
          provide: PARAMS_PROVIDER_TOKEN,
          useValue: {
            pinoHttp: [loggerParams({ LOG_LEVEL: 'warn' }).pinoHttp, stream],
          },
        },
      ],
    });
  });

  it('carries no request: a connection opened during one request and lost during it logs one line without req', async () => {
    const pool = app.get<Pool>(PG_POOL);
    // Close the connections opened at boot, so the POST below opens its own
    // inside the request's logging context.
    await query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND backend_type = 'client backend'`,
    );
    for (let attempt = 0; attempt < 100 && pool.totalCount > 0; attempt++) {
      await sleep(50);
    }
    expect(pool.totalCount).toBe(0);
    await sleep(100);
    lines.length = 0;

    await query(`CREATE FUNCTION test_log_trigger() RETURNS trigger
                   LANGUAGE plpgsql AS $$ BEGIN
                     IF NEW.reps = 777 THEN PERFORM pg_sleep(3); END IF;
                     RETURN NEW; END $$`);
    await query(`CREATE TRIGGER test_log_trigger BEFORE INSERT ON workout_sets
                   FOR EACH ROW EXECUTE FUNCTION test_log_trigger()`);
    try {
      const pending = postEntry(
        app,
        uniqueUserId(),
        entryBody({ sets: [{ reps: 777, weight: 100, unit: 'kg' }] }),
      ).then((res) => res);
      const { pid } = await firstRow<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
          WHERE state = 'active' AND query ILIKE 'insert into "workout_sets"%'`,
      );
      await query('SELECT pg_terminate_backend($1)', [pid]);
      expect((await pending).status).toBe(500);
    } finally {
      await query('DROP TRIGGER IF EXISTS test_log_trigger ON workout_sets');
      await query('DROP FUNCTION IF EXISTS test_log_trigger()');
    }
    await sleep(100);

    const failures = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) =>
        String(line.msg).startsWith('Database connection failed'),
      );
    expect(failures).toEqual([
      expect.objectContaining({
        level: 40,
        msg: 'Database connection failed',
        name: 'Error',
        context: 'Database',
      }),
    ]);
    expect(failures[0]).not.toHaveProperty('req');
    const url = new URL(process.env.DATABASE_URL ?? '');
    expect(JSON.stringify(failures)).not.toContain(url.host);
    expect(JSON.stringify(failures)).not.toContain(url.password);
  });
});
