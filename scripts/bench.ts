// The benchmark runner (design §11): times each case over HTTP and, for a
// case that has `sql`, shows the plan of exactly the query the API runs.
//
// Usage: DATABASE_URL=… [BENCH_BASE_URL=http://localhost:3000] npm run bench
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { Client } from 'pg';
import { quantile } from 'simple-statistics';
import { BENCH_CASES, SINGLE_USER_CASES } from './bench-cases';
import {
  HEAVY_USER,
  insertFreshHeavyEntries,
  removeFreshHeavyEntries,
} from './bench-data';

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
  // Whose data the case reads; the report shows it.
  user?: string;
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

// What §11 asks of a PR plan: the join type, the loop count, the heap
// fetches on the set side and any temporary files, read from the EXPLAIN text.
export type PlanSummary = {
  joins: string[];
  setLoops: number | null;
  setScan: string | null;
  setHeapFetches: number | null;
  entryIndex: string | null;
  entryHeapFetches: number | null;
  tempFiles: string[];
};

export function summarizePlan(plan: string): PlanSummary {
  const joins = new Set<string>();
  const tempFiles: string[] = [];
  let setLoops: number | null = null;
  let setScan: string | null = null;
  let entryIndex: string | null = null;
  let setFetches: number | null = null;
  let entryFetches: number | null = null;
  let relation: string | null = null;
  for (const line of plan.split('\n')) {
    const join = /(Nested Loop|Hash Join|Merge Join|Hash Semi Join)/.exec(line);
    if (join) joins.add(join[1]);
    const scan =
      /(?:Scan|Only Scan)(?: Backward)? using \S+ on (\w+)|Seq Scan on (\w+)/.exec(
        line,
      );
    if (scan) {
      relation = scan[1] ?? scan[2];
      const loops = /loops=(\d+)/.exec(line);
      if (relation === 'workout_sets')
        setScan = /Index Only Scan/.test(line)
          ? 'Index Only Scan'
          : /Index Scan/.test(line)
            ? 'Index Scan'
            : 'Seq Scan';
      if (relation === 'workout_entries')
        entryIndex = /using (\S+)/.exec(line)?.[1] ?? 'Seq Scan';
      if (relation === 'workout_sets' && loops) {
        setLoops = Math.max(setLoops ?? 0, Number(loops[1]));
      }
    }
    const fetches = /Heap Fetches: (\d+)/.exec(line);
    if (fetches) {
      const n = Number(fetches[1]);
      if (relation === 'workout_sets') setFetches = (setFetches ?? 0) + n;
      if (relation === 'workout_entries')
        entryFetches = (entryFetches ?? 0) + n;
    }
    if (/temp (read|written)=|Disk:|external merge/.test(line)) {
      tempFiles.push(line.trim());
    }
  }
  return {
    joins: [...joins],
    setLoops,
    setScan,
    setHeapFetches: setFetches,
    entryIndex,
    entryHeapFetches: entryFetches,
    tempFiles,
  };
}

function formatSummary(sm: PlanSummary): string {
  const peak = (word: string) =>
    Math.max(
      0,
      ...sm.tempFiles.flatMap((l) =>
        [...l.matchAll(new RegExp(`${word}=(\\d+)`, 'g'))].map((m) =>
          Number(m[1]),
        ),
      ),
    );
  const temp =
    sm.tempFiles.length === 0
      ? 'none'
      : `yes (largest node: ${peak('read')} blocks read, ${peak('written')} blocks written, 8 kB each)`;
  const fetches =
    sm.setHeapFetches === null
      ? `n/a (the set side is an ${sm.setScan ?? 'scan'} that reads the heap, so there is no heap-fetch counter)`
      : String(sm.setHeapFetches);
  return (
    `join: ${sm.joins.join(', ') || 'none'}; entry side: ${sm.entryIndex ?? 'n/a'} ` +
    `(heap fetches ${sm.entryHeapFetches ?? 'n/a'}); set side: ${sm.setScan ?? 'n/a'} on workout_sets, ` +
    `loops ${sm.setLoops ?? 'n/a'}, heap fetches ${fetches}; temporary files: ${temp}`
  );
}

const WARMUP = 50;
const MEASURED = 500;
const CONCURRENCY = [1, 8];
const FRESH_INSERTS = 5000;

type Measured = {
  c: BenchCase;
  concurrency: number;
  result?: CaseResult;
  error?: string;
};

type Pass = { title: string; prepared: string; measured: Measured[] };

function dockerResources(): string {
  try {
    const out = execFileSync(
      'docker',
      ['info', '--format', '{{.NCPU}} {{.MemTotal}}'],
      { encoding: 'utf8' },
    ).trim();
    const [cpus, bytes] = out.split(' ');
    return `${cpus} CPUs, ${(Number(bytes) / 1024 ** 3).toFixed(1)} GiB memory`;
  } catch {
    return 'unknown (docker info failed)';
  }
}

async function measurePass(
  cases: BenchCase[],
  ctx: BenchContext,
  baseUrl: string,
): Promise<Measured[]> {
  const out: Measured[] = [];
  for (const c of cases) {
    for (const concurrency of CONCURRENCY) {
      try {
        const result = await runCase(c, ctx, {
          baseUrl,
          warmup: WARMUP,
          measured: MEASURED,
          concurrency,
        });
        out.push({ c, concurrency, result });
        console.log(
          `  ${c.name} @${concurrency}: p50 ${result.p50.toFixed(1)} p95 ${result.p95.toFixed(1)} max ${result.max.toFixed(1)} ms`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        out.push({ c, concurrency, error: message });
        console.log(`  ${c.name} @${concurrency}: FAILED ${message}`);
      }
    }
  }
  return out;
}

// The budgets bind at concurrency 1 (owner's decision); concurrency 8 is
// reported, not gated.
function gateFailures(passes: Pass[]): string[] {
  const failures: string[] = [];
  for (const pass of passes) {
    for (const m of pass.measured) {
      if (m.concurrency !== CONCURRENCY[0]) continue;
      if (m.error) {
        failures.push(`${pass.title}: ${m.c.name} failed: ${m.error}`);
      } else if (
        m.c.budgetP95Ms !== undefined &&
        m.result &&
        !(m.result.p95 < m.c.budgetP95Ms)
      ) {
        failures.push(
          `${pass.title}: ${m.c.name} p95 ${m.result.p95.toFixed(1)} ms is not under ${m.c.budgetP95Ms} ms`,
        );
      }
    }
  }
  return failures;
}

function renderReport(
  passes: Pass[],
  ctx: BenchContext,
  docker: string,
  failures: string[],
): string {
  const lines: string[] = [];
  lines.push('# Benchmark report', '');
  lines.push(
    'Generated by `npm run bench` (design section 11). Method: local Docker, warm cache, ' +
      `${WARMUP} warm-up requests discarded, ${MEASURED} measured requests per case, ` +
      `concurrency ${CONCURRENCY.join(' and ')}, percentiles from \`simple-statistics\` (p95 by linear interpolation). ` +
      `Docker was given ${docker}. Sort memory is at its default. ` +
      `Context: most-trained exercise "${ctx.topKey}", rarely logged exercise "${ctx.rareKey}", least-trained group "${ctx.rareGroup}".`,
    '',
    "**The budgets are checked on the p95 at concurrency 1 only** (the owner's decision); " +
      'the concurrency 8 figures are reported, not gated. Times are wall-clock over HTTP, body included.',
    '',
    "The compare plan below is for one period's statement; over HTTP the API runs two PR statements plus up to six primary-key loads in one transaction, so its HTTP time covers both periods.",
    '',
  );
  for (const pass of passes) {
    lines.push(`## ${pass.title}`, '', pass.prepared, '');
    lines.push(
      '| Case | User | Concurrency | p50 ms | p95 ms | max ms | p95 budget |',
      '|---|---|---|---|---|---|---|',
    );
    for (const m of pass.measured) {
      const b = m.c.budgetP95Ms;
      if (!m.result) {
        lines.push(
          `| ${m.c.name} | ${m.c.user ?? HEAVY_USER} | ${m.concurrency} | FAILED | | | ${b ?? '-'} |`,
        );
        continue;
      }
      const verdict =
        b === undefined
          ? '-'
          : m.concurrency === CONCURRENCY[0]
            ? `< ${b}: ${m.result.p95 < b ? 'pass' : 'FAIL'}`
            : `< ${b} (not gated)`;
      lines.push(
        `| ${m.c.name} | ${m.c.user ?? HEAVY_USER} | ${m.concurrency} | ${m.result.p50.toFixed(1)} | ${m.result.p95.toFixed(1)} | ${m.result.max.toFixed(1)} | ${verdict} |`,
      );
    }
    lines.push('');
    for (const m of pass.measured) {
      if (m.concurrency !== CONCURRENCY[0] || !m.result?.plan) continue;
      lines.push(`### ${m.c.name}: EXPLAIN (ANALYZE, BUFFERS)`, '');
      if (m.c.name.includes('PRs')) {
        lines.push(
          `PR plan details: ${formatSummary(summarizePlan(m.result.plan))}`,
          '',
        );
      }
      lines.push('```', m.result.plan, '```', '');
    }
  }
  lines.push('## Gate', '');
  lines.push(
    failures.length === 0
      ? 'Every budget passes at concurrency 1.'
      : failures.map((f) => `- ${f}`).join('\n'),
    '',
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const baseUrl = process.env.BENCH_BASE_URL ?? 'http://127.0.0.1:3000';
  const cases = [...BENCH_CASES, ...SINGLE_USER_CASES];
  const docker = dockerResources();

  // Pass 1 starts from the loaded data with statistics fresh.
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    await removeFreshHeavyEntries(admin);
    await admin.query('VACUUM (ANALYZE) workout_entries');
    await admin.query('VACUUM (ANALYZE) workout_sets');
  } finally {
    await admin.end();
  }
  const ctx = await loadContext(databaseUrl);
  console.log(
    `method: ${WARMUP} warm-up requests (discarded), ${MEASURED} measured, concurrency ${CONCURRENCY.join(' and ')}; ` +
      `Docker: ${docker}; context topKey="${ctx.topKey}" rareKey="${ctx.rareKey}" rareGroup="${ctx.rareGroup}"`,
  );

  console.log('pass 1: after VACUUM (ANALYZE)');
  const pass1: Pass = {
    title: 'Pass 1: after VACUUM (ANALYZE)',
    prepared: 'Loaded data, then `VACUUM (ANALYZE)` on both tables.',
    measured: await measurePass(cases, ctx, baseUrl),
  };

  console.log(`pass 2: after ${FRESH_INSERTS} fresh inserts, no vacuum`);
  await insertFreshHeavyEntries(databaseUrl, FRESH_INSERTS);
  const pass2: Pass = {
    title: `Pass 2: after ${FRESH_INSERTS} fresh inserts for bench-heavy, no vacuum`,
    prepared: `${FRESH_INSERTS} new entries for \`bench-heavy\` (sessions of 8, newer than the loaded data, 3 or 4 sets each), written in one statement per table and no \`VACUUM\` or \`ANALYZE\` afterwards; autovacuum was not disabled.`,
    measured: await measurePass(cases, ctx, baseUrl),
  };

  const passes = [pass1, pass2];
  const failures = gateFailures(passes);
  const report = renderReport(passes, ctx, docker, failures);
  mkdirSync('bench/out', { recursive: true });
  writeFileSync('bench/report.md', report);
  writeFileSync(
    'bench/out/results.json',
    JSON.stringify(
      passes.map((p) => ({
        title: p.title,
        rows: p.measured.map((m) => ({
          case: m.c.name,
          concurrency: m.concurrency,
          p50: m.result?.p50,
          p95: m.result?.p95,
          max: m.result?.max,
          error: m.error,
        })),
      })),
      null,
      2,
    ),
  );
  console.log(
    failures.length === 0 ? 'gate: pass' : `gate: FAIL\n${failures.join('\n')}`,
  );
  if (failures.length > 0) process.exit(1);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      'bench failed:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
