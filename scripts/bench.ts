// The benchmark runner (design §11): times each case over HTTP and, for a
// case that has `sql`, shows the plan of exactly the query the API runs.
//
// Usage: DATABASE_URL=… [BENCH_BASE_URL=http://localhost:3000] npm run bench
import { performance } from 'node:perf_hooks';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { Client } from 'pg';
import { quantile } from 'simple-statistics';
import { BENCH_CASES } from './bench-cases';
import { HEAVY_USER } from './bench-data';

export type BenchContext = {
  // The heavy user's most-trained exercise key.
  topKey: string;
  // A rarely logged catalog exercise of the heavy user.
  rareKey: string;
  // The muscle group the heavy user trained least.
  rareGroup: string;
};

export type BenchCase = {
  name: string;
  path: (ctx: BenchContext) => string;
  // Comes from the API's own query builder, never typed again, so EXPLAIN
  // runs what the API runs.
  sql?: (ctx: BenchContext) => SQL;
  budgetP95Ms?: number;
};

export type RunOptions = {
  baseUrl: string;
  warmup: number;
  measured: number;
  concurrency: number;
};

export type CaseResult = {
  p50: number;
  p95: number;
  max: number;
  plan: string | null;
};

// The request loop is hand-written on purpose (D-28): autocannon reports p90
// and p97.5, not the p95 the budgets use.
async function timedRequests(
  url: string,
  count: number,
  concurrency: number,
): Promise<number[]> {
  const times: number[] = [];
  let started = 0;
  const worker = async () => {
    while (started < count) {
      started++;
      const t0 = performance.now();
      const res = await fetch(url);
      // Read the body, so the time covers the whole response.
      await res.arrayBuffer();
      const elapsed = performance.now() - t0;
      // A 4xx or 5xx is a broken case, not a fast one.
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      times.push(elapsed);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return times;
}

async function explain(query: SQL): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const { sql: text, params } = new PgDialect().sqlToQuery(query);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<Record<string, string>>(
      `EXPLAIN (ANALYZE, BUFFERS) ${text}`,
      params,
    );
    return rows.map((row) => row['QUERY PLAN']).join('\n');
  } finally {
    await client.end();
  }
}

export async function runCase(
  c: BenchCase,
  ctx: BenchContext,
  opts: RunOptions,
): Promise<CaseResult> {
  const url = `${opts.baseUrl}${c.path(ctx)}`;
  await timedRequests(url, opts.warmup, opts.concurrency);
  const times = await timedRequests(url, opts.measured, opts.concurrency);
  return {
    p50: quantile(times, 0.5),
    p95: quantile(times, 0.95),
    max: Math.max(...times),
    plan: c.sql ? await explain(c.sql(ctx)) : null,
  };
}

// Read from the data once, at the start.
export async function loadContext(databaseUrl: string): Promise<BenchContext> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const top = await client.query<{ exercise_key: string }>(
      `SELECT exercise_key FROM workout_entries WHERE user_id = $1
        GROUP BY exercise_key ORDER BY count(*) DESC, exercise_key LIMIT 1`,
      [HEAVY_USER],
    );
    const rareKey = await client.query<{ exercise_key: string }>(
      `SELECT e.exercise_key FROM workout_entries e
         JOIN exercises x ON x.exercise_key = e.exercise_key
        WHERE e.user_id = $1
        GROUP BY e.exercise_key ORDER BY count(*), e.exercise_key LIMIT 1`,
      [HEAVY_USER],
    );
    const rareGroup = await client.query<{ muscle_group: string }>(
      `SELECT g.muscle_group FROM workout_entries e
         JOIN exercise_muscle_groups g ON g.exercise_key = e.exercise_key
        WHERE e.user_id = $1
        GROUP BY g.muscle_group ORDER BY count(*), g.muscle_group LIMIT 1`,
      [HEAVY_USER],
    );
    if (!top.rows[0] || !rareKey.rows[0] || !rareGroup.rows[0]) {
      throw new Error(`no entries for ${HEAVY_USER}; run bench:data first`);
    }
    return {
      topKey: top.rows[0].exercise_key,
      rareKey: rareKey.rows[0].exercise_key,
      rareGroup: rareGroup.rows[0].muscle_group,
    };
  } finally {
    await client.end();
  }
}

const WARMUP = 50;
const MEASURED = 500;
const CONCURRENCY = [1, 8];

async function main(): Promise<void> {
  if (BENCH_CASES.length === 0) {
    console.log('bench: no cases yet');
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const baseUrl = process.env.BENCH_BASE_URL ?? 'http://localhost:3000';
  const ctx = await loadContext(databaseUrl);
  console.log(
    `method: ${WARMUP} warm-up requests (discarded), ${MEASURED} measured, concurrency ${CONCURRENCY.join(' and ')}; ` +
      `context topKey="${ctx.topKey}" rareKey="${ctx.rareKey}" rareGroup="${ctx.rareGroup}"`,
  );
  const rows: Record<string, string | number>[] = [];
  for (const c of BENCH_CASES) {
    for (const concurrency of CONCURRENCY) {
      const r = await runCase(c, ctx, {
        baseUrl,
        warmup: WARMUP,
        measured: MEASURED,
        concurrency,
      });
      rows.push({
        case: c.name,
        concurrency,
        'p50 ms': Number(r.p50.toFixed(1)),
        'p95 ms': Number(r.p95.toFixed(1)),
        'max ms': Number(r.max.toFixed(1)),
        budget:
          c.budgetP95Ms === undefined
            ? '-'
            : `${c.budgetP95Ms} ${r.p95 <= c.budgetP95Ms ? 'ok' : 'OVER'}`,
      });
      if (r.plan && concurrency === CONCURRENCY[0]) {
        console.log(`\n${c.name}: EXPLAIN (ANALYZE, BUFFERS)\n${r.plan}\n`);
      }
    }
  }
  console.table(rows);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('bench failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
