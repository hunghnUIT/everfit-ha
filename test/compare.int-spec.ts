import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { createTestApp } from './support/app';
import {
  entryBody,
  NOW,
  postEntry,
  PROBLEM_JSON,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

type SetBody = { reps: number; weight: number; unit: string };

const NULL_RECORDS = {
  heaviestSet: null,
  highestVolumeSet: null,
  bestEstimatedOneRepMax: null,
};

// The two periods of the §9.4 example: February against January.
const FEB = { from: '2025-02-01T00:00:00Z', to: '2025-03-01T00:00:00Z' };
const JAN = { from: '2025-01-01T00:00:00Z', to: '2025-02-01T00:00:00Z' };

// The query of a comparison of Bench Press between two periods.
function periods(
  current: { from: string; to: string },
  previous: { from: string; to: string },
  extra = '',
): string {
  return (
    `?exercise=Bench%20Press&from=${current.from}&to=${current.to}` +
    `&compareFrom=${previous.from}&compareTo=${previous.to}${extra}`
  );
}

// The comparison route (design §9.4; §12, the PRs and compare row).
describe('PR comparison (design §9.4)', () => {
  let app: INestApplication;
  const compare = (userId: string, qs: string) =>
    request(app.getHttpServer()).get(
      `/v1/users/${userId}/personal-records/compare${qs}`,
    );

  // Logs one Bench Press entry and returns its id.
  async function log(
    userId: string,
    date: string,
    sets: SetBody[],
  ): Promise<string> {
    const res = withStatus(
      await postEntry(app, userId, entryBody({ date, sets })),
      201,
    );
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  // A client's first month of training is the ordinary case (§9.4).
  it('one empty period → 200, the populated side, deltas null, and the exact §9.4 message naming the empty period', async () => {
    const userId = uniqueUserId();
    const feb = await log(userId, '2025-02-10T05:30:00+07:00', [
      { reps: 5, weight: 100, unit: 'kg' },
    ]);
    const set = {
      weight: 100,
      reps: 5,
      unit: 'kg',
      original: { weight: 100, unit: 'kg' },
      date: '2025-02-09T22:30:00.000Z',
      utcOffset: '+07:00',
      entryId: feb,
      setNumber: 1,
    };
    const februaryRecords = {
      heaviestSet: set,
      highestVolumeSet: { volume: 500, ...set },
      bestEstimatedOneRepMax: { estimatedOneRepMax: 116.67, ...set },
    };
    const hint =
      'This filter matches the whole exercise name; ' +
      `GET /v1/users/${userId}/workout-entries?exercise=bench%20press lists the names that contain it.`;

    const res = withStatus(await compare(userId, periods(FEB, JAN)), 200);
    expect(res.body).toEqual({
      data: {
        exercise: { key: 'bench press' },
        unit: 'kg',
        current: {
          range: {
            from: '2025-02-01T00:00:00.000Z',
            to: '2025-03-01T00:00:00.000Z',
          },
          records: februaryRecords,
        },
        previous: {
          range: {
            from: '2025-01-01T00:00:00.000Z',
            to: '2025-02-01T00:00:00.000Z',
          },
          records: NULL_RECORDS,
        },
        delta: NULL_RECORDS,
      },
      message:
        "No entries for 'bench press' from 2025-01-01T00:00:00.000Z (included) " +
        'to 2025-02-01T00:00:00.000Z (excluded), the comparison period. ' +
        hint,
    });

    // The same periods the other way round: now the current one is empty.
    const swapped = withStatus(await compare(userId, periods(JAN, FEB)), 200);
    expect(swapped.body.data.current.records).toEqual(NULL_RECORDS);
    expect(swapped.body.data.previous.records).toEqual(februaryRecords);
    expect(swapped.body.data.delta).toEqual(NULL_RECORDS);
    expect(swapped.body.message).toBe(
      "No entries for 'bench press' from 2025-01-01T00:00:00.000Z (included) " +
        'to 2025-02-01T00:00:00.000Z (excluded), the current period. ' +
        hint,
    );
  });

  it('both periods empty → 200, every record and delta null, and the exact message naming both periods', async () => {
    const userId = uniqueUserId();
    const res = withStatus(await compare(userId, periods(FEB, JAN)), 200);
    expect(res.body).toEqual({
      data: {
        exercise: { key: 'bench press' },
        unit: 'kg',
        current: {
          range: {
            from: '2025-02-01T00:00:00.000Z',
            to: '2025-03-01T00:00:00.000Z',
          },
          records: NULL_RECORDS,
        },
        previous: {
          range: {
            from: '2025-01-01T00:00:00.000Z',
            to: '2025-02-01T00:00:00.000Z',
          },
          records: NULL_RECORDS,
        },
        delta: NULL_RECORDS,
      },
      message:
        "No entries for 'bench press' from 2025-02-01T00:00:00.000Z (included) " +
        'to 2025-03-01T00:00:00.000Z (excluded), the current period, ' +
        'nor from 2025-01-01T00:00:00.000Z (included) to 2025-02-01T00:00:00.000Z ' +
        '(excluded), the comparison period. This filter matches the whole exercise name; ' +
        `GET /v1/users/${userId}/workout-entries?exercise=bench%20press lists the names that contain it.`,
    });
  });

  it('absolute deltas are in the requested unit (lb)', async () => {
    const userId = uniqueUserId();
    await log(userId, '2025-01-20T06:00:00+07:00', [
      { reps: 5, weight: 100, unit: 'kg' },
    ]);
    await log(userId, '2025-02-10T06:00:00+07:00', [
      { reps: 5, weight: 105, unit: 'kg' },
    ]);
    const res = withStatus(
      await compare(userId, periods(FEB, JAN, '&unit=lb')),
      200,
    );
    expect(res.body.data.unit).toBe('lb');
    expect(res.body.data.current.records.heaviestSet.weight).toBe(231.49);
    // +5 kg is 11.02 lb; +25 kg of volume is 55.12 lb; +5.83 kg of
    // estimated 1RM is 12.86 lb. The percentages carry no unit.
    expect(res.body.data.delta).toEqual({
      heaviestSet: { absolute: 11.02, percent: 5 },
      highestVolumeSet: { absolute: 55.12, percent: 5 },
      bestEstimatedOneRepMax: { absolute: 12.86, percent: 5 },
    });
    expect(res.body.message).toBeUndefined();
  });

  it('overlapping periods are accepted', async () => {
    const userId = uniqueUserId();
    const jan = await log(userId, '2025-01-20T06:00:00+07:00', [
      { reps: 5, weight: 100, unit: 'kg' },
    ]);
    const feb = await log(userId, '2025-02-05T06:00:00+07:00', [
      { reps: 5, weight: 110, unit: 'kg' },
    ]);
    // Mid-January to mid-February holds both entries; February only one.
    const res = withStatus(
      await compare(
        userId,
        periods(FEB, {
          from: '2025-01-15T00:00:00Z',
          to: '2025-02-15T00:00:00Z',
        }),
      ),
      200,
    );
    expect(res.body.data.current.records.heaviestSet.entryId).toBe(feb);
    expect(res.body.data.previous.records.heaviestSet.entryId).toBe(feb);
    expect(res.body.data.delta.heaviestSet).toEqual({
      absolute: 0,
      percent: 0,
    });
    expect(
      Object.values(res.body.data.current.records).map(
        (r) => (r as { entryId: string }).entryId,
      ),
    ).not.toContain(jan);
  });

  // The comparison pair gets the current pair's range check (Task 15 review).
  it.each([
    ['after', { from: JAN.to, to: JAN.from }],
    ['equal to', { from: JAN.from, to: JAN.from }],
  ])('compareFrom %s compareTo → 400 on compareFrom', async (_, previous) => {
    const res = withStatus(
      await compare(uniqueUserId(), periods(FEB, previous)),
      400,
    );
    expect(res.body.errors).toEqual([
      {
        path: 'compareFrom',
        message:
          'compareFrom must be earlier than compareTo: compareFrom is included and compareTo is not, so this range is empty.',
      },
    ]);
  });

  // Review Focus 5
  it('missing compareFrom and to → one 400 listing both', async () => {
    const res = withStatus(
      await compare(
        uniqueUserId(),
        `?exercise=Bench%20Press&from=${FEB.from}&compareTo=${JAN.to}`,
      ),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      {
        path: 'to',
        message:
          'to is required: the end of the current period, excluded, for example to=2025-03-01T00:00:00Z.',
      },
      {
        path: 'compareFrom',
        message:
          'compareFrom is required: the start of the comparison period, included, for example compareFrom=2025-01-01T00:00:00Z.',
      },
    ]);
  });

  // §9; Review Focus 4
  it('?period=month → 400 naming period; path userId user%3A1 → 400 naming userId', async () => {
    const unknown = withStatus(
      await compare(uniqueUserId(), periods(FEB, JAN, '&period=month')),
      400,
    );
    expect(unknown.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(unknown.body.errors).toEqual([
      {
        path: 'period',
        message:
          "Unknown query parameter 'period'. Accepted parameters: exercise, from, to, compareFrom, compareTo, unit.",
      },
    ]);

    const badUser = withStatus(
      await compare('user%3A1', periods(FEB, JAN)),
      400,
    );
    expect(badUser.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(badUser.body.errors).toEqual([
      {
        path: 'userId',
        message:
          "'user:1' is not a userId: use 1 to 64 ASCII letters, digits, '_', '.' or '-'.",
      },
    ]);
  });
});
