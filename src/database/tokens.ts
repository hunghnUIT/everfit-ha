import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema';

// The pg Pool (max DB_POOL_MAX, statement_timeout DB_STATEMENT_TIMEOUT_MS).
export const PG_POOL = Symbol('PG_POOL');

// The Drizzle database over PG_POOL.
export const DB = Symbol('DB');

export type Database = NodePgDatabase<typeof schema>;

// The database or a transaction opened on it, so a repository method runs
// inside either: `db.transaction((tx) => repo.save(tx, …))`.
export type Executor =
  Database | Parameters<Parameters<Database['transaction']>[0]>[0];
