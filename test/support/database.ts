import { randomUUID } from 'node:crypto';
import { Client, escapeIdentifier, Pool, QueryResultRow } from 'pg';
import {
  DEFAULT_SEED_PATH,
  readSeedFile,
  runSeed,
} from '../../src/exercises/catalog-seed';

// A short-lived connection to the shared test database, or to another one.
async function withClient<T>(
  run: (client: Client) => Promise<T>,
  connectionString = process.env.DATABASE_URL,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// Every integration file starts on empty workout tables and the catalog as
// the real seed file gives it (setup-int.ts). runSeed takes a PoolClient.
export async function resetDatabase(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `TRUNCATE workout_sets, workout_entries,
                  exercise_muscle_groups, exercises, muscle_groups,
                  catalog_seed_ledger`,
      );
      await runSeed(client, readSeedFile(DEFAULT_SEED_PATH), () => {});
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

// A new database on the test container, with nothing in it, for a test that
// must start from nothing. CREATE DATABASE takes no bound parameter; the name
// is generated here and quoted.
export async function createEmptyDatabase(): Promise<string> {
  const name = `empty_${randomUUID().replaceAll('-', '')}`;
  await withClient((client) =>
    client.query(`CREATE DATABASE ${escapeIdentifier(name)}`),
  );
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${name}`;
  return url.toString();
}

// Runs one query on the shared test database, or on the database at `url`.
export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
  url?: string,
): Promise<R[]> {
  return withClient(
    async (client) => (await client.query<R>(text, values)).rows,
    url,
  );
}
