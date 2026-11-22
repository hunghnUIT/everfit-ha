import { Inject, Injectable } from '@nestjs/common';
import uniq from 'lodash/uniq';
import { DB, type Database, type Executor } from '../database/tokens';
import { PrMetric } from '../workouts/domain/metrics';
import {
  StoredEntry,
  WorkoutsRepository,
} from '../workouts/workouts.repository';
import { buildRecordsQuery, RecordsRange } from './records-query';

// One record: the entry that holds it, with all its sets, and the set.
export type RecordRow = { entry: StoredEntry; setNumber: number };

// The three records of one exercise; each is null when nothing is in range.
export type RecordSet = Record<PrMetric, RecordRow | null>;

// SQL only. Runs on the database or on a transaction the caller opened
// (`db`), so compare can read two periods at one moment (§9.4).
@Injectable()
export class PersonalRecordsRepository {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly workouts: WorkoutsRepository,
  ) {}

  // The §9.3 statement picks at most three (entry, set) pairs, filtered by
  // user, so findEntriesByIds gets only this user's ids; then those at most
  // three entries and their sets are read by primary key.
  async findRecords(
    userId: string,
    key: string,
    range: RecordsRange,
    db: Executor = this.db,
  ): Promise<RecordSet> {
    const { rows } = await db.execute<{
      record: PrMetric;
      id: string;
      set_number: number;
    }>(buildRecordsQuery(userId, key, range));
    const entries = await this.workouts.findEntriesByIds(
      uniq(rows.map((row) => row.id)),
      db,
    );
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const set: RecordSet = { weight: null, volume: null, e1rm: null };
    for (const row of rows) {
      const entry = byId.get(row.id);
      // Entries are never deleted, so a winner is always read back.
      if (entry === undefined) {
        throw new Error(`Record entry ${row.id} was not read back`);
      }
      set[row.record] = { entry, setNumber: row.set_number };
    }
    return set;
  }
}
