import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock';
import { ApiProblem, validationProblem } from '../common/problem';
import { DB, type Database } from '../database/tokens';
import {
  EXERCISE_CATALOG,
  type ExerciseCatalog,
} from '../exercises/exercise-catalog';
import { UNIT_REGISTRY, UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import { readEntryInputs } from './entry-input';
import { EntryResponse, toEntryResponse } from './entry-response';
import { WorkoutsRepository } from './workouts.repository';

// The one 404 for an entry: an id that is not a UUID gets it too (the
// controller's ParseUUIDPipe), so both answers are the same.
export function entryNotFound(): ApiProblem {
  return new ApiProblem(
    404,
    'NOT_FOUND',
    'This user has no workout entry with that id.',
  );
}

// Orchestration only. Each request reads the clock once and takes one catalog
// snapshot, which every lookup of its response uses (design §8, §10.2).
@Injectable()
export class WorkoutsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EXERCISE_CATALOG) private readonly catalog: ExerciseCatalog,
    @Inject(UNIT_REGISTRY) private readonly units: UnitRegistry,
    private readonly repository: WorkoutsRepository,
  ) {}

  // The body is validated whole by readEntryInputs, which reports every
  // fault of the request at once. Shown in kg (§9.1).
  async logEntry(userId: string, body: unknown): Promise<EntryResponse> {
    const [entry] = await this.logEntries(userId, body, 'single');
    return entry;
  }

  // 1–100 entries, all or none (design §9.1, §9.5), returned in the order sent.
  async logBulk(userId: string, body: unknown): Promise<EntryResponse[]> {
    return this.logEntries(userId, body, 'bulk');
  }

  // Every entry is written and read back in one transaction (two INSERTs, two
  // SELECTs, whatever the count), so each item is the entry exactly as every
  // later read returns it, created_at included. One snapshot formats them all.
  private async logEntries(
    userId: string,
    body: unknown,
    shape: 'single' | 'bulk',
  ): Promise<EntryResponse[]> {
    const result = readEntryInputs(body, shape, userId, {
      units: this.units,
      now: this.clock.now(),
    });
    if (!result.ok) throw validationProblem(result.errors);
    const entries = result.value;
    const ids = entries.map((entry) => entry.id);
    const stored = await this.db.transaction(async (tx) => {
      await this.repository.insertEntries(entries, tx);
      return this.repository.findEntriesByIds(ids, tx);
    });
    if (stored.length !== ids.length) {
      throw new Error(
        `${ids.length - stored.length} of ${ids.length} entries were not read back after their insert`,
      );
    }
    const snapshot = this.catalog.snapshot();
    return stored.map((entry) =>
      toEntryResponse(entry, 'kg', snapshot, this.units),
    );
  }

  // `unit` is the query's text, already checked by EntryQueryDto; kg when absent.
  async getEntry(
    userId: string,
    id: string,
    unit: string | undefined,
  ): Promise<EntryResponse> {
    const snapshot = this.catalog.snapshot();
    const code: UnitCode | null =
      unit === undefined ? 'kg' : this.units.resolve(unit);
    if (code === null) {
      throw new Error(`Unit '${unit}' passed EntryQueryDto unresolved`);
    }
    const stored = await this.repository.findEntry(userId, id);
    if (stored === null) {
      throw entryNotFound();
    }
    return toEntryResponse(stored, code, snapshot, this.units);
  }
}
