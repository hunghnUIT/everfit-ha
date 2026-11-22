import { CatalogSnapshot } from './catalog-snapshot';

// The port business logic sees (design §10.1). A request calls snapshot() once,
// at its start, and uses that snapshot for every lookup (§10.2).
export interface ExerciseCatalog {
  // The latest complete snapshot. Synchronous and never blocks.
  snapshot(): CatalogSnapshot;
  // Loads the catalog again, after any load already running, so a change
  // committed before the call is included. Resolves when that load has ended,
  // whether it succeeded or failed: a failed load is logged, the last snapshot
  // kept, and the load retried (§10.2). It rejects only if logging that
  // failure throws, and the retry is scheduled before the log line. How long
  // it takes is bounded only by the database driver.
  refresh(): Promise<void>;
}

export const EXERCISE_CATALOG = Symbol('EXERCISE_CATALOG');
