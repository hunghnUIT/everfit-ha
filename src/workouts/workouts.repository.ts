import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { workoutEntries, workoutSets } from '../database/schema';
import { DB, type Database, type Executor } from '../database/tokens';
import { UNIT_REGISTRY, UnitRegistry } from '../units/unit-registry';
import { NewEntry, NewSet } from './entry-input';

// An entry as the repository reads it back: the weights are the database's
// exact decimal strings, and createdAt is the database's default.
export type StoredEntry = Omit<NewEntry, 'sets'> & {
  createdAt: Date;
  sets: NewSet[];
};

// SQL only. Every statement is built by Drizzle and parameterised. Each method
// runs on the database or on a transaction the caller opened (`executor`), so
// the service can read an entry back inside the transaction that wrote it.
@Injectable()
export class WorkoutsRepository {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(UNIT_REGISTRY) private readonly units: UnitRegistry,
  ) {}

  // One transaction, two multi-row INSERTs: the entries, then their sets
  // (design §9.1). Sets carry the ids the application generated, so nothing
  // depends on the order PostgreSQL returns rows in. created_at is the
  // database's default. On a caller's transaction this is a savepoint.
  async insertEntries(
    entries: NewEntry[],
    executor: Executor = this.db,
  ): Promise<void> {
    await executor.transaction(async (tx) => {
      await tx.insert(workoutEntries).values(
        entries.map((e) => ({
          id: e.id,
          userId: e.userId,
          exerciseName: e.exerciseName,
          exerciseKey: e.exerciseKey,
          performedAt: e.performedAt,
          utcOffsetMinutes: e.utcOffsetMinutes,
        })),
      );
      await tx.insert(workoutSets).values(
        entries.flatMap((e) =>
          e.sets.map((set) => ({
            entryId: e.id,
            setNumber: set.setNumber,
            reps: set.reps,
            weight: set.weight,
            unit: set.unit,
            weightKg: set.weightKg,
          })),
        ),
      );
    });
  }

  // Filtered by user and id together, so one user never reads another's
  // entry. Sets come back in set_number order. Instants arrive as Dates from
  // the query builder, numerics as exact strings.
  async findEntry(
    userId: string,
    id: string,
    executor: Executor = this.db,
  ): Promise<StoredEntry | null> {
    const [entry] = await executor
      .select()
      .from(workoutEntries)
      .where(and(eq(workoutEntries.userId, userId), eq(workoutEntries.id, id)));
    if (entry === undefined) return null;
    const sets = await executor
      .select()
      .from(workoutSets)
      .where(eq(workoutSets.entryId, id))
      .orderBy(asc(workoutSets.setNumber));
    return {
      id: entry.id,
      userId: entry.userId,
      exerciseName: entry.exerciseName,
      exerciseKey: entry.exerciseKey,
      performedAt: entry.performedAt,
      utcOffsetMinutes: entry.utcOffsetMinutes,
      createdAt: entry.createdAt,
      sets: sets.map((set) => this.toNewSet(set)),
    };
  }

  // The unit column is text with no CHECK (design §6): a stored code is
  // reached through the registry, and one it does not know is a data fault.
  private toNewSet(set: typeof workoutSets.$inferSelect): NewSet {
    const unit = this.units.resolve(set.unit);
    if (unit === null) {
      throw new Error(`Stored unit '${set.unit}' is not registered`);
    }
    return {
      setNumber: set.setNumber,
      reps: set.reps,
      weight: set.weight,
      unit,
      weightKg: set.weightKg,
    };
  }
}
