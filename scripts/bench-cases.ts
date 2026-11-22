// class-transformer and the DTO's OpenAPI decorators read metadata through
// Reflect, which Nest's own entry point loads in the API.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import once from 'lodash/once';
import { encodeCursor } from '../src/common/cursor';
import { readSeedFile, DEFAULT_SEED_PATH } from '../src/exercises/catalog-seed';
import { CatalogSnapshot } from '../src/exercises/catalog-snapshot';
import { RecordsQueryDto } from '../src/personal-records/dto/records-query.dto';
import {
  buildRecordsQuery,
  readRecordsQuery,
} from '../src/personal-records/records-query';
import { SHARED_UNIT_REGISTRY } from '../src/units/unit-registry';
import { HistoryQueryDto } from '../src/workouts/dto/history-query.dto';
import {
  buildHistoryIdsQuery,
  HistoryQuery,
  readHistoryQuery,
} from '../src/workouts/history-query';
import type { BenchCase, BenchContext } from './bench';
import { BENCH_ANCHOR, HEAVY_USER } from './bench-data';

// The catalog the benchmark database was seeded with: the seed file, which
// is what the API's snapshot holds there. Read once, on first use.
const seedSnapshot = once(() => {
  const seed = readSeedFile(DEFAULT_SEED_PATH);
  return new CatalogSnapshot(
    { exercises: seed.exercises, groups: seed.muscleGroups },
    0,
  );
});

// The query parameters go through readHistoryQuery as the API reads them,
// so the explained SQL is the statement the timed requests run.
function historyQuery(params: Record<string, string>): HistoryQuery {
  const result = readHistoryQuery(
    plainToInstance(HistoryQueryDto, params),
    HEAVY_USER,
    seedSnapshot(),
    SHARED_UNIT_REGISTRY,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

function historyCase(
  name: string,
  params: (ctx: BenchContext) => Record<string, string>,
  budgetP95Ms?: number,
): BenchCase {
  return {
    name,
    path: (ctx) => {
      const qs = new URLSearchParams(params(ctx)).toString();
      return `/v1/users/${HEAVY_USER}/workout-entries${qs ? `?${qs}` : ''}`;
    },
    sql: (ctx) => buildHistoryIdsQuery(historyQuery(params(ctx))),
    budgetP95Ms,
  };
}

// The same for a records request: readRecordsQuery as the API reads it,
// then buildRecordsQuery, the statement findRecords runs.
function recordsCase(
  name: string,
  params: (ctx: BenchContext) => Record<string, string>,
  budgetP95Ms?: number,
): BenchCase {
  return {
    name,
    path: (ctx) =>
      `/v1/users/${HEAVY_USER}/personal-records?${new URLSearchParams(params(ctx)).toString()}`,
    sql: (ctx) => {
      const result = readRecordsQuery(
        plainToInstance(RecordsQueryDto, params(ctx)),
        SHARED_UNIT_REGISTRY,
      );
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      return buildRecordsQuery(HEAVY_USER, result.value.key, result.value);
    },
    budgetP95Ms,
  };
}

// The last year of the heavy user's data, which ends at BENCH_ANCHOR.
const LAST_YEAR = {
  from: Temporal.Instant.from(BENCH_ANCHOR)
    .subtract({ hours: 365 * 24 })
    .toString(),
  to: BENCH_ANCHOR,
};

// A deep page: a cursor about halfway back through the heavy user's 22 years
// (bench-data's span), with the largest UUID, so every entry at that instant
// is still to come and the scan starts in the middle of the index.
const DEEP_CURSOR = encodeCursor({
  at: new Date(
    Temporal.Instant.from(BENCH_ANCHOR).subtract({ hours: 11 * 365 * 24 })
      .epochMilliseconds,
  ),
  id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
});

// Tasks 13 to 15 add the cases of their routes here. A case that has `sql`
// takes it from the API's own query builder, so EXPLAIN shows what runs.
// Budgets are design §11's p95s; the common term has none and is reported.
export const BENCH_CASES: BenchCase[] = [
  historyCase('history: first page', () => ({}), 30),
  historyCase('history: deep page', () => ({ cursor: DEEP_CURSOR }), 30),
  historyCase('history: common partial term', () => ({ exercise: 'press' })),
  historyCase(
    'history: term that matches nothing',
    () => ({ exercise: 'bnech' }),
    100,
  ),
  historyCase(
    'history: rare exercise by term',
    (ctx) => ({ exercise: ctx.rareKey }),
    100,
  ),
  historyCase(
    'history: rare exercise by muscle group',
    (ctx) => ({ muscleGroup: ctx.rareGroup }),
    100,
  ),
  recordsCase(
    'PRs: most-trained exercise, all-time',
    (ctx) => ({ exercise: ctx.topKey }),
    50,
  ),
  recordsCase(
    'PRs: most-trained exercise, last year',
    (ctx) => ({ exercise: ctx.topKey, ...LAST_YEAR }),
    50,
  ),
];
