import { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { runCase, BenchContext } from '../scripts/bench';
import { createTestApp } from './support/app';

const CTX: BenchContext = { topKey: 'a', rareKey: 'b', rareGroup: 'c' };

describe('bench runner', () => {
  let baseUrl: string;

  beforeAll(async () => {
    const app = await createTestApp();
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  const opts = () => ({ baseUrl, warmup: 5, measured: 20, concurrency: 1 });

  it('times GET /health/ready: p50 ≤ p95 ≤ max, and no plan without sql', async () => {
    const r = await runCase(
      { name: 'ready', path: () => '/health/ready' },
      CTX,
      opts(),
    );
    expect(r.p50).toBeGreaterThan(0);
    expect(r.p50).toBeLessThanOrEqual(r.p95);
    expect(r.p95).toBeLessThanOrEqual(r.max);
    expect(r.plan).toBeNull();
  });

  it('measures at a concurrency of 8, and returns the plan of a case that has sql', async () => {
    const r = await runCase(
      {
        name: 'ready with plan',
        path: () => '/health/ready',
        sql: (ctx) => sql`SELECT count(*) FROM workout_entries WHERE user_id = ${ctx.topKey}`,
      },
      CTX,
      { ...opts(), concurrency: 8 },
    );
    expect(r.p50).toBeLessThanOrEqual(r.p95);
    expect(r.p95).toBeLessThanOrEqual(r.max);
    expect(r.plan).toContain('Execution Time');
  });

  it('rejects a case whose route answers an error, rather than timing it', async () => {
    await expect(
      runCase({ name: 'missing', path: () => '/nope' }, CTX, opts()),
    ).rejects.toThrow('404');
  });
});
