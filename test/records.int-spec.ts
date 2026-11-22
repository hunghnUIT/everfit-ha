import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fc from 'fast-check';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { D } from '../src/common/decimal';
import { ApiEnv } from '../src/config/env';
import {
  PersonalRecordsRepository,
  RecordRow,
} from '../src/personal-records/personal-records.repository';
import { pickRecord, PrMetric, rank } from '../src/workouts/domain/metrics';
import { createTestApp } from './support/app';
import {
  entryBody,
  NOW,
  postEntry,
  PROBLEM_JSON,
  storedCandidates,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

// The number of different writes the concurrency test sends at once.
const BURST = 8;

type SetBody = { reps: number; weight: number; unit: string };
type RecordJson = { entryId: string; setNumber: number } | null;

const NULL_RECORDS = {
  heaviestSet: null,
  highestVolumeSet: null,
  bestEstimatedOneRepMax: null,
};

// The response's record names, by the domain's metric.
const RECORD_FIELDS: [PrMetric, string][] = [
  ['weight', 'heaviestSet'],
  ['volume', 'highestVolumeSet'],
  ['e1rm', 'bestEstimatedOneRepMax'],
];

// The personal-records route (design §9.3; §12, PRs and concurrency).
describe('personal records (design §9.3)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const records = (userId: string, qs: string) =>
    http().get(`/v1/users/${userId}/personal-records${qs}`);

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

  // Which entry and set each record names.
  const winners = (body: { data: { records: Record<string, RecordJson> } }) =>
    Object.fromEntries(
      RECORD_FIELDS.map(([, field]) => {
        const r = body.data.records[field];
        return [field, r && { entryId: r.entryId, setNumber: r.setNumber }];
      }),
    );

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  it('a name that matches no whole exercise name → 200, three null records, and exactly this message', async () => {
    await log('u_pr', '2025-02-10T05:30:00+07:00', [
      { reps: 5, weight: 100, unit: 'kg' },
    ]);
    const res = withStatus(await records('u_pr', '?exercise=bench'), 200);
    expect(res.body).toEqual({
      data: {
        exercise: { key: 'bench' },
        unit: 'kg',
        range: { from: null, to: null },
        records: NULL_RECORDS,
      },
      message:
        "No entries found for exercise 'bench' in this range. This filter matches the whole exercise name; " +
        'GET /v1/users/u_pr/workout-entries?exercise=bench lists the names that contain it.',
    });
  });

  it('a ranged request returns records from the range only', async () => {
    const userId = uniqueUserId();
    // January's set would hold every record if the range let it in.
    await log(userId, '2025-01-20T06:00:00+07:00', [
      { reps: 5, weight: 150, unit: 'kg' },
    ]);
    const heavy = await log(userId, '2025-02-03T06:00:00+07:00', [
      { reps: 5, weight: 100, unit: 'kg' },
    ]);
    const long = await log(userId, '2025-02-05T06:00:00+07:00', [
      { reps: 8, weight: 80, unit: 'kg' },
      { reps: 10, weight: 90, unit: 'kg' },
    ]);
    const res = withStatus(
      await records(
        userId,
        '?exercise=Bench%20Press&from=2025-02-01T00:00:00Z&to=2025-03-01T00:00:00Z',
      ),
      200,
    );
    const set90 = {
      weight: 90,
      reps: 10,
      unit: 'kg',
      original: { weight: 90, unit: 'kg' },
      date: '2025-02-04T23:00:00.000Z',
      utcOffset: '+07:00',
      entryId: long,
      setNumber: 2,
    };
    expect(res.body).toEqual({
      data: {
        exercise: { key: 'bench press' },
        unit: 'kg',
        range: {
          from: '2025-02-01T00:00:00.000Z',
          to: '2025-03-01T00:00:00.000Z',
        },
        records: {
          heaviestSet: {
            weight: 100,
            reps: 5,
            unit: 'kg',
            original: { weight: 100, unit: 'kg' },
            date: '2025-02-02T23:00:00.000Z',
            utcOffset: '+07:00',
            entryId: heavy,
            setNumber: 1,
          },
          // 90 × 10 = 900; 90 × 40 / 30 = 120 beats 100 × 35 / 30 = 116.67.
          highestVolumeSet: { volume: 900, ...set90 },
          bestEstimatedOneRepMax: { estimatedOneRepMax: 120, ...set90 },
        },
      },
    });
  });

  // A double-tap or a retry stores the same workout twice (§9.5); an equal
  // lift never moves a record (§7).
  it('two identical entries do not change any record', async () => {
    const userId = uniqueUserId();
    const body = entryBody();
    withStatus(await postEntry(app, userId, body), 201);
    const before = withStatus(
      await records(userId, '?exercise=Bench%20Press'),
      200,
    ).body;
    withStatus(await postEntry(app, userId, body), 201);
    const after = withStatus(
      await records(userId, '?exercise=Bench%20Press'),
      200,
    ).body;
    expect(after).toEqual(before);
  });

  it(`after ${BURST} concurrent writes for one user and exercise, the records equal pickRecord over the stored sets (§12)`, async () => {
    const poolMax = app
      .get<ConfigService<ApiEnv, true>>(ConfigService)
      .get('DB_POOL_MAX', { infer: true });
    expect(BURST).toBeLessThan(poolMax);
    const userId = uniqueUserId();
    // Each request sends its own weights and reps on plate steps, kg and lb
    // mixed, all at one instant, as two devices syncing one session would.
    const responses = await Promise.all(
      Array.from({ length: BURST }, (_, i) =>
        postEntry(
          app,
          userId,
          entryBody({
            sets: [
              { reps: 5, weight: 100 + 2.5 * i, unit: 'kg' },
              { reps: 3 + i, weight: 200 + 5 * i, unit: 'lb' },
            ],
          }),
        ),
      ),
    );
    responses.forEach((res) => withStatus(res, 201));

    const res = withStatus(
      await records(userId, '?exercise=Bench%20Press'),
      200,
    );
    const candidates = await storedCandidates(userId, 'bench press');
    expect(candidates).toHaveLength(2 * BURST);
    const expected = Object.fromEntries(
      RECORD_FIELDS.map(([metric, field]) => {
        const best = pickRecord(metric, candidates);
        return [
          field,
          best && { entryId: best.entryId, setNumber: best.setNumber },
        ];
      }),
    );
    expect(winners(res.body)).toEqual(expected);
  });

  // Review Focus 5
  it('no exercise parameter → 400 naming exercise', async () => {
    const res = withStatus(await records(uniqueUserId(), '?unit=kg'), 400);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      {
        path: 'exercise',
        message:
          'exercise is required: send the whole exercise name, for example exercise=Bench%20Press.',
      },
    ]);
  });

  // §9; Review Focus 2
  it('?exerciseName=bench → 400 naming exerciseName; unit=kg&unit=lb → 400 on unit', async () => {
    const userId = uniqueUserId();
    const unknown = withStatus(
      await records(userId, '?exercise=Bench%20Press&exerciseName=bench'),
      400,
    );
    expect(unknown.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(unknown.body.errors).toEqual([
      {
        path: 'exerciseName',
        message:
          "Unknown query parameter 'exerciseName'. Accepted parameters: exercise, from, to, unit.",
      },
    ]);

    const twice = withStatus(
      await records(userId, '?exercise=Bench%20Press&unit=kg&unit=lb'),
      400,
    );
    expect(twice.body.errors).toEqual([
      {
        path: 'unit',
        message: "'unit' was sent more than once; send it once.",
      },
    ]);
  });

  // Review Focus 4
  it('path userId coach%40example.com → 400 naming userId', async () => {
    const res = withStatus(
      await records('coach%40example.com', '?exercise=Bench%20Press'),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.errors).toEqual([
      { path: 'userId', message: expect.any(String) },
    ]);
  });

  // fast-check, the first item on the cut list (§16).
  it('a PR over a range never beats the all-time PR', async () => {
    const repository = app.get(PersonalRecordsRepository);
    // Days of February drawn from a small pool, so ranges cut between
    // entries and on them; weights on plate steps, kg and lb.
    const days = Array.from(
      { length: 5 },
      (_, i) => `2025-02-0${1 + i}T06:00:00.000Z`,
    );
    const set = fc.oneof(
      fc.record({
        reps: fc.integer({ min: 1, max: 30 }),
        weight: fc.integer({ min: 0, max: 80 }).map((k) => 2.5 * k),
        unit: fc.constant('kg'),
      }),
      fc.record({
        reps: fc.integer({ min: 1, max: 30 }),
        weight: fc.integer({ min: 0, max: 80 }).map((k) => 5 * k),
        unit: fc.constant('lb'),
      }),
    );
    const score = (metric: PrMetric, row: RecordRow | null) => {
      const s = row?.entry.sets.find((x) => x.setNumber === row.setNumber);
      return s && rank(metric, { reps: s.reps, weightKg: new D(s.weightKg) });
    };
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            date: fc.constantFrom(...days),
            sets: fc.array(set, { minLength: 1, maxLength: 4 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.option(fc.constantFrom(...days), { nil: undefined }),
        fc.option(fc.constantFrom(...days), { nil: undefined }),
        async (entries, from, to) => {
          fc.pre(from === undefined || to === undefined || from < to);
          const userId = uniqueUserId('range');
          withStatus(
            await http()
              .post(`/v1/users/${userId}/workout-entries/bulk`)
              .send({ entries: entries.map((e) => entryBody(e)) }),
            201,
          );
          const all = await repository.findRecords(userId, 'bench press', {});
          const ranged = await repository.findRecords(userId, 'bench press', {
            from: from === undefined ? undefined : new Date(from),
            to: to === undefined ? undefined : new Date(to),
          });
          for (const metric of ['weight', 'volume', 'e1rm'] as const) {
            const inRange = score(metric, ranged[metric]);
            const allTime = score(metric, all[metric]);
            expect(allTime).toBeDefined();
            if (inRange !== undefined) {
              expect(inRange.lessThanOrEqualTo(allTime!)).toBe(true);
            }
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
