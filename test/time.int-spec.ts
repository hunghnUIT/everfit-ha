import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { decodeCursor } from '../src/common/cursor';
import { createTestApp } from './support/app';
import { query } from './support/database';
import {
  entryBody,
  postEntry,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

// The §8 traveller's second workout is at 03:30Z, half an hour after the
// shared NOW, so this file's clock stands later than both workouts.
const LATER_NOW = '2025-02-11T04:00:00Z';

// §12, the Time row: history, PRs and compare.
describe('time (design §8)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  // The ids history lists for userId between the two bounds, each sent
  // percent-encoded, so a + stays a +.
  async function listed(
    userId: string,
    from: string,
    to: string,
  ): Promise<string[]> {
    const qs = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = withStatus(
      await http().get(`/v1/users/${userId}/workout-entries${qs}`),
      200,
    );
    return (res.body.data as { id: string }[]).map((e) => e.id);
  }

  async function log(
    userId: string,
    date: string,
    sets?: { reps: number; weight: number; unit: string }[],
  ) {
    const body = entryBody(sets === undefined ? { date } : { date, sets });
    return withStatus(await postEntry(app, userId, body), 201).body.data as {
      id: string;
      date: string;
      utcOffset: string | null;
    };
  }

  // The entry ids the three PR records of userId's Bench Press name between
  // the two bounds, each sent percent-encoded.
  async function recordIds(
    userId: string,
    from: string,
    to: string,
  ): Promise<Set<string>> {
    const qs = `?exercise=Bench%20Press&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const res = withStatus(
      await http().get(`/v1/users/${userId}/personal-records${qs}`),
      200,
    );
    return new Set(
      Object.values(
        res.body.data.records as Record<string, { entryId: string } | null>,
      ).flatMap((r) => (r === null ? [] : [r.entryId])),
    );
  }

  // The entry ids the records of each period of one comparison name: the
  // current period [from, to) and the comparison period [compareFrom,
  // compareTo), each bound sent percent-encoded.
  async function comparedIds(
    userId: string,
    current: [string, string],
    previous: [string, string],
  ): Promise<{ current: Set<string>; previous: Set<string> }> {
    const [from, to, compareFrom, compareTo] = [...current, ...previous].map(
      encodeURIComponent,
    );
    const qs = `?exercise=Bench%20Press&from=${from}&to=${to}&compareFrom=${compareFrom}&compareTo=${compareTo}`;
    const res = withStatus(
      await http().get(`/v1/users/${userId}/personal-records/compare${qs}`),
      200,
    );
    const ids = (records: Record<string, { entryId: string } | null>) =>
      new Set(
        Object.values(records).flatMap((r) => (r === null ? [] : [r.entryId])),
      );
    return {
      current: ids(res.body.data.current.records),
      previous: ids(res.body.data.previous.records),
    };
  }

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(LATER_NOW) }],
    });
  });

  it('the traveller pair falls in the right half-open ranges for a viewer in Hanoi and one at UTC−7, each with its own utcOffset', async () => {
    const userId = uniqueUserId();
    const vietnam = await log(userId, '2025-02-10T05:30:00+07:00');
    const america = await log(userId, '2025-02-10T20:30:00-07:00');
    expect([vietnam.date, vietnam.utcOffset]).toEqual([
      '2025-02-09T22:30:00.000Z',
      '+07:00',
    ]);
    expect([america.date, america.utcOffset]).toEqual([
      '2025-02-11T03:30:00.000Z',
      '-07:00',
    ]);

    // A viewer in Hanoi: Feb 10, 05:30 and Feb 11, 10:30.
    expect(
      await listed(
        userId,
        '2025-02-10T00:00:00+07:00',
        '2025-02-11T00:00:00+07:00',
      ),
    ).toEqual([vietnam.id]);
    expect(
      await listed(
        userId,
        '2025-02-11T00:00:00+07:00',
        '2025-02-12T00:00:00+07:00',
      ),
    ).toEqual([america.id]);
    // A viewer at UTC−7: Feb 9, 15:30 and Feb 10, 20:30.
    expect(
      await listed(
        userId,
        '2025-02-09T00:00:00-07:00',
        '2025-02-10T00:00:00-07:00',
      ),
    ).toEqual([vietnam.id]);
    expect(
      await listed(
        userId,
        '2025-02-10T00:00:00-07:00',
        '2025-02-11T00:00:00-07:00',
      ),
    ).toEqual([america.id]);

    const both = withStatus(
      await http().get(`/v1/users/${userId}/workout-entries`),
      200,
    );
    expect(
      both.body.data.map((e: { id: string; utcOffset: string }) => [
        e.id,
        e.utcOffset,
      ]),
    ).toEqual([
      [america.id, '-07:00'],
      [vietnam.id, '+07:00'],
    ]);
  });

  it('entries at from − 1 ms, from, to − 1 ms and to across two adjacent periods each appear in exactly one (history)', async () => {
    const userId = uniqueUserId();
    // Two adjacent periods [a, b) and [b, c): b is one's to and the other's from.
    const a = '2025-02-01T00:00:00.000Z';
    const b = '2025-02-02T00:00:00.000Z';
    const c = '2025-02-03T00:00:00.000Z';
    const at = async (date: string) => (await log(userId, date)).id;
    const beforeA = await at('2025-01-31T23:59:59.999Z');
    const atA = await at(a);
    const beforeB = await at('2025-02-01T23:59:59.999Z');
    const atB = await at(b);
    const beforeC = await at('2025-02-02T23:59:59.999Z');
    const atC = await at(c);

    const first = await listed(userId, a, b);
    const second = await listed(userId, b, c);
    expect(first).toEqual([beforeB, atA]);
    expect(second).toEqual([beforeC, atB]);
    for (const outside of [beforeA, atC]) {
      expect([...first, ...second]).not.toContain(outside);
    }
  });

  it('the four boundary entries each appear in exactly one period (PRs)', async () => {
    const userId = uniqueUserId();
    const a = '2025-02-01T00:00:00.000Z';
    const b = '2025-02-02T00:00:00.000Z';
    const c = '2025-02-03T00:00:00.000Z';
    // Inside each period, the entry at its from holds the heaviest set and
    // the one a millisecond before its to holds the highest volume, so both
    // show. The two entries outside both periods would win every record if
    // a bound let them in.
    const at = async (date: string, weight: number, reps: number) =>
      (await log(userId, date, [{ reps, weight, unit: 'kg' }])).id;
    const beforeA = await at('2025-01-31T23:59:59.999Z', 150, 10);
    const atA = await at(a, 120, 1);
    const beforeB = await at('2025-02-01T23:59:59.999Z', 80, 10);
    const atB = await at(b, 120, 1);
    const beforeC = await at('2025-02-02T23:59:59.999Z', 80, 10);
    const atC = await at(c, 150, 10);

    const first = await recordIds(userId, a, b);
    const second = await recordIds(userId, b, c);
    expect(first).toEqual(new Set([atA, beforeB]));
    expect(second).toEqual(new Set([atB, beforeC]));
    for (const outside of [beforeA, atC]) {
      expect([...first, ...second]).not.toContain(outside);
    }
  });

  it('the four boundary entries each appear in exactly one period (compare)', async () => {
    const userId = uniqueUserId();
    const a = '2025-02-01T00:00:00.000Z';
    const b = '2025-02-02T00:00:00.000Z';
    const c = '2025-02-03T00:00:00.000Z';
    // The same entries as the PRs test: in each period the entry at its from
    // holds the heaviest set and the one a millisecond before its to the
    // highest volume; the two outside would win every record if let in. The
    // entry at b is heavier than the one at a, so an inclusive compareTo
    // would let it win the comparison period's heaviest set, not tie.
    const at = async (date: string, weight: number, reps: number) =>
      (await log(userId, date, [{ reps, weight, unit: 'kg' }])).id;
    const beforeA = await at('2025-01-31T23:59:59.999Z', 150, 10);
    const atA = await at(a, 120, 1);
    const beforeB = await at('2025-02-01T23:59:59.999Z', 80, 10);
    const atB = await at(b, 130, 1);
    const beforeC = await at('2025-02-02T23:59:59.999Z', 80, 10);
    const atC = await at(c, 150, 10);

    // The later period is the current one, the earlier the comparison.
    const { current, previous } = await comparedIds(userId, [b, c], [a, b]);
    expect(previous).toEqual(new Set([atA, beforeB]));
    expect(current).toEqual(new Set([atB, beforeC]));
    for (const outside of [beforeA, atC]) {
      expect([...current, ...previous]).not.toContain(outside);
    }
  });

  it('a read bound before 1900 → 400', async () => {
    const userId = uniqueUserId();
    for (const bound of ['from', 'to']) {
      const res = withStatus(
        await http().get(
          `/v1/users/${userId}/workout-entries?${bound}=1899-12-31T23:59:59Z`,
        ),
        400,
      );
      expect(res.body.errors).toEqual([
        {
          path: bound,
          message:
            "'1899-12-31T23:59:59Z' is before 1900-01-01T00:00:00Z, the earliest moment accepted. Check the year.",
        },
      ]);
    }
    withStatus(
      await http().get(
        `/v1/users/${userId}/workout-entries?from=1900-01-01T00:00:00Z`,
      ),
      200,
    );
  });

  it('instants in responses and cursors are right under the non-UTC process and database zones', async () => {
    // The premise: the process and the database are in zones that are
    // neither UTC nor each other.
    expect(process.env.TZ).toBe('Asia/Ho_Chi_Minh');
    const [zone] = await query<{ TimeZone: string }>('SHOW TimeZone');
    expect(zone.TimeZone).toBe('America/Los_Angeles');

    const userId = uniqueUserId();
    const older = await log(userId, '2025-02-10T05:30:00.250+07:00');
    await log(userId, '2025-02-10T20:30:00-07:00');

    // Page one holds the newer entry; its cursor names the newer instant.
    const page1 = withStatus(
      await http().get(`/v1/users/${userId}/workout-entries?limit=1`),
      200,
    );
    expect(page1.body.data[0].date).toBe('2025-02-11T03:30:00.000Z');
    expect(decodeCursor(page1.body.page.nextCursor)?.at.toISOString()).toBe(
      '2025-02-11T03:30:00.000Z',
    );

    const page2 = withStatus(
      await http().get(
        `/v1/users/${userId}/workout-entries?limit=1&cursor=${encodeURIComponent(page1.body.page.nextCursor)}`,
      ),
      200,
    );
    expect(page2.body.data[0]).toMatchObject({
      id: older.id,
      date: '2025-02-09T22:30:00.250Z',
      utcOffset: '+07:00',
    });

    // A bound written in Hanoi's offset names the same instant: from is
    // included at the stored millisecond and excludes it one millisecond later.
    expect(
      await listed(
        userId,
        '2025-02-10T05:30:00.250+07:00',
        '2025-02-10T06:00:00+07:00',
      ),
    ).toEqual([older.id]);
    expect(
      await listed(
        userId,
        '2025-02-10T05:30:00.251+07:00',
        '2025-02-10T06:00:00+07:00',
      ),
    ).toEqual([]);
  });
});
