import { INestApplication } from '@nestjs/common';
import fc from 'fast-check';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { decodeCursor } from '../src/common/cursor';
import { createTestApp } from './support/app';
import { query } from './support/database';
import { NOW, uniqueUserId, withStatus } from './support/fixtures';

type Logged = { id: string; date: string };

// The mixed paging walk (design §9.2, §12): never cut.
describe('paging walk (design §9.2)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  // One bulk request; its entries come back in the order sent.
  async function logBulk(userId: string, dates: string[]): Promise<Logged[]> {
    const res = withStatus(
      await http()
        .post(`/v1/users/${userId}/workout-entries/bulk`)
        .send({
          entries: dates.map((date, i) => ({
            date,
            exerciseName: `Exercise ${i % 3}`,
            sets: [{ reps: 1 + (i % 30), weight: 100, unit: 'kg' }],
          })),
        }),
      201,
    );
    return (res.body.data as { id: string; date: string }[]).map((e) => ({
      id: e.id,
      date: e.date,
    }));
  }

  // The documented order, worked out here from the POST responses: newest
  // instant first, then the larger id. The dates are all printed as
  // toISOString() does, and UUID text compares as PostgreSQL's uuid does
  // (lower-case hex, fixed width).
  // Code-unit order, as both columns compare; localeCompare would collate.
  const descending = (x: string, y: string) => (x < y ? 1 : x > y ? -1 : 0);
  const documentedOrder = (logged: Logged[]) =>
    logged
      .toSorted((x, y) => descending(x.date, y.date) || descending(x.id, y.id))
      .map((e) => e.id);

  type Page = {
    data: { id: string; date: string }[];
    page: { limit: number; hasMore: boolean; nextCursor: string | null };
  };

  // Every page from the first, following nextCursor until hasMore is false.
  async function walk(userId: string, limit: number): Promise<Page[]> {
    const pages: Page[] = [];
    let cursor: string | null = null;
    do {
      const qs: string =
        `?limit=${limit}` +
        (cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`);
      const res = withStatus(
        await http().get(`/v1/users/${userId}/workout-entries${qs}`),
        200,
      );
      const page = res.body as Page;
      pages.push(page);
      cursor = page.page.nextCursor;
      expect(page.page.hasMore).toBe(cursor !== null);
      if (pages.length > 1000) throw new Error('the walk does not end');
    } while (cursor !== null);
    return pages;
  }

  // Different instants, and instants shared by several entries of one bulk.
  async function mixedFixture(userId: string): Promise<Logged[]> {
    return [
      ...(await logBulk(userId, [
        '2025-02-03T06:00:00Z',
        '2025-02-03T06:00:00Z',
        '2025-02-03T06:00:00Z',
      ])),
      ...(await logBulk(userId, ['2025-02-05T06:00:00.500Z'])),
      ...(await logBulk(userId, [
        '2025-02-01T06:00:00Z',
        '2025-02-01T06:00:00Z',
      ])),
      ...(await logBulk(userId, ['2025-02-07T18:00:00+07:00'])),
      ...(await logBulk(userId, [
        '2025-02-05T06:00:00.500Z',
        '2025-02-04T06:00:00Z',
      ])),
    ];
  }

  it('entries on different instants and sharing one instant, walked at page size one: each exactly once, in order', async () => {
    const userId = uniqueUserId();
    const logged = await mixedFixture(userId);
    const pages = await walk(userId, 1);
    const walked = pages.flatMap((p) => p.data.map((e) => e.id));
    expect(walked).toEqual(documentedOrder(logged));
    expect(new Set(walked).size).toBe(logged.length);
    expect(pages).toHaveLength(logged.length);
  });

  it('each nextCursor decodes to the stored performed_at and id of the last row returned', async () => {
    const userId = uniqueUserId();
    await mixedFixture(userId);
    const pages = await walk(userId, 2);
    for (const page of pages.filter((p) => p.page.nextCursor !== null)) {
      const last = page.data.at(-1);
      if (last === undefined) throw new Error('a page with a cursor has rows');
      const [row] = await query<{ at: string }>(
        `SELECT to_char(performed_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at
           FROM workout_entries WHERE id = $1`,
        [last.id],
      );
      const cursor = decodeCursor(page.page.nextCursor ?? '');
      expect(cursor).not.toBeNull();
      expect(cursor?.id).toBe(last.id);
      expect(cursor?.at.toISOString()).toBe(row.at);
    }
  });

  // fast-check, the first item on the cut list (§16).
  it('a pagination walk over generated entries returns every row exactly once, in order', async () => {
    // Instants drawn from a small pool, so ties are common, as in real
    // sessions logged with one time.
    const pool = Array.from(
      { length: 6 },
      (_, i) =>
        `2025-02-0${1 + i}T06:00:00.${String(i * 111).padStart(3, '0')}Z`,
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.array(fc.constantFrom(...pool), { minLength: 1, maxLength: 8 }),
          {
            minLength: 1,
            maxLength: 4,
          },
        ),
        fc.integer({ min: 1, max: 5 }),
        async (bulks, limit) => {
          const userId = uniqueUserId('walk');
          const logged: Logged[] = [];
          for (const dates of bulks)
            logged.push(...(await logBulk(userId, dates)));
          const walked = (await walk(userId, limit)).flatMap((p) =>
            p.data.map((e) => e.id),
          );
          expect(walked).toEqual(documentedOrder(logged));
        },
      ),
      { numRuns: 25 },
    );
  });
});
