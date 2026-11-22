import { CatalogSnapshot } from './catalog-snapshot';

// The port business logic sees (design §10.1). A request calls snapshot() once,
// at its start, and uses that snapshot for every lookup (§10.2).
export interface ExerciseCatalog {
  // The latest complete snapshot. Synchronous and never blocks.
  snapshot(): CatalogSnapshot;
  // Loads the catalog again, after any load already running, so a change
  // committed before the call is included. Never rejects: a failed load is
  // logged, the last snapshot kept, and the load retried (§10.2).
  refresh(): Promise<void>;
}

export const EXERCISE_CATALOG = Symbol('EXERCISE_CATALOG');
