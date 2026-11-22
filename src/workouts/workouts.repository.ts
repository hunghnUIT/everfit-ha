import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import groupBy from 'lodash/groupBy';
import { workoutEntries, workoutSets } from '../database/schema';
import { pgArray } from '../database/sql';
import { DB, type Database, type Executor } from '../database/tokens';
import { UNIT_REGISTRY, UnitRegistry } from '../units/unit-registry';
import { NewEntry, NewSet } from './entry-input';
import { buildHistoryIdsQuery, HistoryQuery } from './history-query';

// An entry as the repository reads it back: the weights are the database's
// exact decimal strings, and createdAt is the database's default.
export type StoredEntry = Omit<NewEntry, 'sets'> & {
  createdAt: Date;
  sets: NewSet[];
};

// SQL only. Every statement is built by Drizzle and parameterised. Each method
// runs on the database or on a transaction the caller opened (`db`), so
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
    db: Executor = this.db,
  ): Promise<void> {
    await db.transaction(async (tx) => {
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
    db: Executor = this.db,
  ): Promise<StoredEntry | null> {
    const [entry] = await db
      .select()
      .from(workoutEntries)
      .where(and(eq(workoutEntries.userId, userId), eq(workoutEntries.id, id)));
    if (entry === undefined) return null;
    const sets = await db
      .select()
      .from(workoutSets)
      .where(eq(workoutSets.entryId, id))
      .orderBy(asc(workoutSets.setNumber));
    return this.toStoredEntry(entry, sets);
  }

  // The entries with these ids and their sets, in the order of `ids`: one
  // query for the entries and one for all their sets, whatever the count. An
  // id with no row is left out, so the caller compares the lengths when it
  // expects every id. Not filtered by user: the ids come from the caller's
  // own insert or from a query that already filtered by user.
  async findEntriesByIds(
    ids: readonly string[],
    db: Executor = this.db,
  ): Promise<StoredEntry[]> {
    if (ids.length === 0) return [];
    const anyId = pgArray(ids, 'uuid');
    const entries = await db
      .select()
      .from(workoutEntries)
      .where(sql`${workoutEntries.id} = ANY(${anyId})`);
    const sets = await db
      .select()
      .from(workoutSets)
      .where(sql`${workoutSets.entryId} = ANY(${anyId})`)
      .orderBy(asc(workoutSets.entryId), asc(workoutSets.setNumber));
    // lodash: Map.groupBy is ES2024, past this project's lib.
    const setsById = groupBy(sets, (set) => set.entryId);
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    return ids.flatMap((id) => {
      const entry = entriesById.get(id);
      return entry === undefined
        ? []
        : [this.toStoredEntry(entry, setsById[id] ?? [])];
    });
  }

  // One page of history, in two steps on purpose (design §9.2): the ids,
  // index-only, with one look-ahead row that says whether there is more,
  // then the full rows and their sets by primary key. A muscle group that no
  // exercise has matches nothing, so it costs no query. Step 1 filters by
  // user, so findEntriesByIds gets only this user's ids.
  async findHistoryPage(
    q: HistoryQuery,
    db: Executor = this.db,
  ): Promise<{ entries: StoredEntry[]; hasMore: boolean }> {
    if (q.keys !== undefined && q.keys.length === 0) {
      return { entries: [], hasMore: false };
    }
    const { rows } = await db.execute<{ id: string }>(buildHistoryIdsQuery(q));
    const ids = rows.slice(0, q.limit).map((row) => row.id);
    return {
      entries: await this.findEntriesByIds(ids, db),
      hasMore: rows.length > q.limit,
    };
  }

  // `sets` are the entry's rows in set_number order.
  private toStoredEntry(
    entry: typeof workoutEntries.$inferSelect,
    sets: (typeof workoutSets.$inferSelect)[],
  ): StoredEntry {
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
