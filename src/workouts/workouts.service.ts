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

  // The body is validated whole by readEntryInputs; the entry is written and
  // read back in one transaction, so the response is the entry exactly as
  // every later read returns it, created_at included. Shown in kg (§9.1).
  async logEntry(userId: string, body: unknown): Promise<EntryResponse> {
    const result = readEntryInputs(body, 'single', userId, {
      units: this.units,
      now: this.clock.now(),
    });
    if (!result.ok) throw validationProblem(result.errors);
    const [entry] = result.value;
    const stored = await this.db.transaction(async (tx) => {
      await this.repository.insertEntries([entry], tx);
      return this.repository.findEntry(userId, entry.id, tx);
    });
    if (stored === null) {
      throw new Error(`Entry ${entry.id} was not read back after its insert`);
    }
    return toEntryResponse(stored, 'kg', this.catalog.snapshot(), this.units);
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
      throw new ApiProblem(
        404,
        'NOT_FOUND',
        `User '${userId}' has no workout entry with the id '${id}'.`,
      );
    }
    return toEntryResponse(stored, code, snapshot, this.units);
  }
}
