import { randomUUID } from 'node:crypto';
import { Client, escapeIdentifier, QueryResultRow } from 'pg';

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

// Every integration file starts on empty workout tables (setup-int.ts).
export async function resetDatabase(): Promise<void> {
  await withClient((client) =>
    client.query('TRUNCATE workout_sets, workout_entries'),
  );
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
