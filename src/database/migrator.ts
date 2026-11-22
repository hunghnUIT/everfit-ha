import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { Pool, PoolClient } from 'pg';
import pino from 'pino';
import { MigrateEnv } from '../config/env';
import {
  DEFAULT_SEED_PATH,
  readSeedFile,
  runSeed,
} from '../exercises/catalog-seed';
import { MIGRATE_LOCK } from './locks';

// Next to this file: dist/database/migrations in the build (nest-cli.json
// copies it), src/database/migrations under ts-jest.
const MIGRATIONS_FOLDER = join(__dirname, 'migrations');

// Drizzle's migrator, on the client that holds the lock. It takes no lock of
// its own, and runs the pending files in one transaction on that client.
export async function runMigrations(client: PoolClient): Promise<void> {
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
}

// The one-shot step compose runs before api (design §13): one connection,
// under MIGRATE_LOCK, the migrations, then the catalog seed (§10.3). The seed
// file is read and validated first, so an invalid file throws SeedFileError
// before any lock, migration or write. No statement_timeout is set: a
// migration is never cut off by a limit sized for requests.
export async function runMigrateStep(
  env: MigrateEnv,
  opts: { seedPath?: string } = {},
): Promise<void> {
  const seed = readSeedFile(opts?.seedPath ?? DEFAULT_SEED_PATH);
  // The seed's warnings (a group an admin deleted) go to the step's log.
  const logger = pino({ name: 'migrate', level: env.LOG_LEVEL });
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK]);
      try {
        await runMigrations(client);
        await runSeed(client, seed, (line) => logger.warn(line));
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK]);
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
