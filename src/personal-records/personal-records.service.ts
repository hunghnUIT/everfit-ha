import { Inject, Injectable } from '@nestjs/common';
import type Decimal from 'decimal.js';
import { validationProblem } from '../common/problem';
import { DB, type Database } from '../database/tokens';
import { UNIT_REGISTRY, UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import { e1rmKg, KgSet, PrMetric, volumeKg } from '../workouts/domain/metrics';
import { ComparePeriod, readCompareQuery } from './compare-query';
import { Delta, computeDelta } from './domain/delta';
import { CompareQueryDto } from './dto/compare-query.dto';
import { RecordsQueryDto } from './dto/records-query.dto';
import {
  PersonalRecordsRepository,
  RecordSet,
} from './personal-records.repository';
import { readRecordsQuery } from './records-query';
import { readRecord, RecordsJson, toRecordsResponse } from './records-response';

export type RecordsData = {
  exercise: { key: string };
  unit: UnitCode;
  range: { from: string | null; to: string | null };
  records: RecordsJson;
};

type PeriodJson = {
  range: { from: string; to: string };
  records: RecordsJson;
};

export type CompareData = {
  exercise: { key: string };
  unit: UnitCode;
  current: PeriodJson;
  previous: PeriodJson;
  delta: Record<keyof RecordsJson, Delta | null>;
};

// The end of every empty-result message (§9.3, §9.4): it points at the
// filter that finds names containing the key.
function wholeNameHint(userId: string, key: string): string {
  return (
    'This filter matches the whole exercise name; ' +
    `GET /v1/users/${userId}/workout-entries?exercise=${encodeURIComponent(key)} ` +
    'lists the names that contain it.'
  );
}

// Design §9.3: fixed text, the same whether the name or the range was the
// reason, so no second query is spent finding out which. It quotes the key,
// which is what was searched for.
export function noRecordsMessage(userId: string, key: string): string {
  return (
    `No entries found for exercise '${key}' in this range. ` +
    wholeNameHint(userId, key)
  );
}

// Design §9.4: names the empty period or periods, bounds as instants.
function emptyPeriodsMessage(
  userId: string,
  key: string,
  empty: { name: string; period: ComparePeriod }[],
): string {
  const named = empty
    .map(
      ({ name, period }) =>
        `from ${period.from.toISOString()} (included) to ` +
        `${period.to.toISOString()} (excluded), the ${name} period`,
    )
    .join(', nor ');
  return `No entries for '${key}' ${named}. ${wholeNameHint(userId, key)}`;
}

// Orchestration only.
@Injectable()
export class PersonalRecordsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(UNIT_REGISTRY) private readonly units: UnitRegistry,
    private readonly repository: PersonalRecordsRepository,
  ) {}

  async getRecords(
    userId: string,
    query: RecordsQueryDto,
  ): Promise<{ data: RecordsData; message?: string }> {
    const checked = readRecordsQuery(query, this.units);
    if (!checked.ok) throw validationProblem(checked.errors);
    const { key, from, to, unit } = checked.value;
    const found = await this.repository.findRecords(userId, key, { from, to });
    const data: RecordsData = {
      exercise: { key },
      unit,
      range: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      records: toRecordsResponse(found, unit, this.units),
    };
    // The three records read the same rows, so they are empty together.
    return found.weight === null
      ? { data, message: noRecordsMessage(userId, key) }
      : { data };
  }

  // Both periods are read in one REPEATABLE READ, read-only transaction, so
  // they describe the same moment: a set logged between the two reads cannot
  // appear in one period and be missing from the delta (§9.4). Each read,
  // and the load of its winners, runs on the transaction.
  async compareRecords(
    userId: string,
    query: CompareQueryDto,
  ): Promise<{ data: CompareData; message?: string }> {
    const checked = readCompareQuery(query, this.units);
    if (!checked.ok) throw validationProblem(checked.errors);
    const { key, current, previous, unit } = checked.value;
    const [now, before] = await this.db.transaction(
      async (tx) => [
        await this.repository.findRecords(userId, key, current, tx),
        await this.repository.findRecords(userId, key, previous, tx),
      ],
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

    const period = (range: ComparePeriod, found: RecordSet): PeriodJson => ({
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      records: toRecordsResponse(found, unit, this.units),
    });
    // One record's delta, from its headline number in exact kilograms (the
    // weight, the volume or the estimated 1RM), never the rounded one.
    const deltaOf = (metric: PrMetric, headline: (s: KgSet) => Decimal) => {
      const kg = (found: RecordSet) => {
        const row = found[metric];
        return row && headline(readRecord(row, unit, this.units).kg);
      };
      return computeDelta(kg(now), kg(before), unit, this.units);
    };

    const data: CompareData = {
      exercise: { key },
      unit,
      current: period(current, now),
      previous: period(previous, before),
      delta: {
        heaviestSet: deltaOf('weight', (s) => s.weightKg),
        highestVolumeSet: deltaOf('volume', volumeKg),
        bestEstimatedOneRepMax: deltaOf('e1rm', e1rmKg),
      },
    };
    // The three records of a period read the same rows: empty together.
    const empty = [
      { name: 'current', period: current, found: now },
      { name: 'comparison', period: previous, found: before },
    ].filter(({ found }) => found.weight === null);
    return empty.length > 0
      ? { data, message: emptyPeriodsMessage(userId, key, empty) }
      : { data };
  }
}
