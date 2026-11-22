import { INestApplication } from '@nestjs/common';
import fc from 'fast-check';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import {
  PersonalRecordsRepository,
  RecordSet,
} from '../src/personal-records/personal-records.repository';
import { pickRecord, PrMetric } from '../src/workouts/domain/metrics';
import { createTestApp } from './support/app';
import {
  NOW,
  storedCandidates,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

type SetBody = { reps: number; weight: number; unit: string };
type EntryBody = { date: string; sets: SetBody[] };
type Winner = { entryId: string; setNumber: number } | null;

const METRICS: PrMetric[] = ['weight', 'volume', 'e1rm'];

const D1 = '2025-02-03T06:00:00+07:00';
const D2 = '2025-02-05T06:00:00+07:00';

const kg = (weight: number, reps: number): SetBody => ({
  reps,
  weight,
  unit: 'kg',
});
const lb = (weight: number, reps: number): SetBody => ({
  reps,
  weight,
  unit: 'lb',
});

// Each scenario is one exercise, logged in one bulk request in this order (so
// ids rise in this order), and the entry index and set number that should
// hold each record.
const SCENARIOS: {
  name: string;
  entries: EntryBody[];
  expected: Record<PrMetric, [number, number]>;
}[] = [
  {
    // Epley at one rep (D-12): 100 × 31 = 3100 beats 96 × 32 = 3072.
    name: 'Bench Press',
    entries: [
      { date: D1, sets: [kg(100, 1)] },
      { date: D2, sets: [kg(96, 2)] },
    ],
    expected: { weight: [0, 1], volume: [1, 1], e1rm: [0, 1] },
  },
  {
    // Equal scores on two dates: straight sets logged first for the later
    // date, then the earlier date, then the earlier date again. The earliest
    // instant wins, then the lower id, then the lower set number.
    name: 'Squat',
    entries: [
      { date: D2, sets: [kg(140, 5), kg(140, 5)] },
      { date: D1, sets: [kg(140, 5), kg(140, 5)] },
      { date: D1, sets: [kg(140, 5), kg(140, 5)] },
    ],
    expected: { weight: [1, 1], volume: [1, 1], e1rm: [1, 1] },
  },
  {
    // §7's pound tie: 100 lb × 10 and, later, 200 lb × 5 have equal exact
    // volumes in kg; the first keeps the volume record.
    name: 'Overhead Press',
    entries: [
      { date: D1, sets: [lb(100, 10)] },
      { date: D2, sets: [lb(200, 5)] },
    ],
    expected: { weight: [1, 1], volume: [0, 1], e1rm: [1, 1] },
  },
  {
    // A kg set against lb sets: 230 lb (104.33 kg) is the heaviest; 102.5 kg
    // × 5 beats 225 lb (102.06 kg) × 5 on volume and estimated 1RM.
    name: 'Deadlift',
    entries: [
      { date: D1, sets: [lb(225, 5), lb(230, 3)] },
      { date: D2, sets: [kg(102.5, 5)] },
    ],
    expected: { weight: [0, 2], volume: [1, 1], e1rm: [1, 1] },
  },
  {
    // An exact pound volume tie a week apart: 135 lb × 4 and 180 lb × 3 are
    // both 540 lb (244.9398798 kg). The earlier set keeps the record; weights
    // rounded to two kg decimals would give 244.92 against 244.95.
    name: 'Barbell Row',
    entries: [
      { date: D1, sets: [lb(135, 4)] },
      { date: '2025-02-10T06:00:00+07:00', sets: [lb(180, 3)] },
    ],
    expected: { weight: [1, 1], volume: [0, 1], e1rm: [1, 1] },
  },
  {
    // A high-rep set holds the estimated 1RM: 60 × (30 + 30) = 3600 beats
    // 100 × (30 + 5) = 3500. Epley applies at every rep count (§7).
    name: 'Leg Press',
    entries: [
      { date: D1, sets: [kg(100, 5)] },
      { date: D2, sets: [kg(60, 30)] },
    ],
    expected: { weight: [0, 1], volume: [1, 1], e1rm: [1, 1] },
  },
  {
    // Zero-weight sets only: every score is 0, so the first set wins.
    name: 'Pull Up',
    entries: [
      { date: D1, sets: [kg(0, 10), kg(0, 12)] },
      { date: D2, sets: [kg(0, 15)] },
    ],
    expected: { weight: [0, 1], volume: [0, 1], e1rm: [0, 1] },
  },
  {
    // A zero-weight set against a weighted one.
    name: 'Dip',
    entries: [
      { date: D1, sets: [kg(0, 20)] },
      { date: D2, sets: [kg(10, 5)] },
    ],
    expected: { weight: [1, 1], volume: [1, 1], e1rm: [1, 1] },
  },
];

// The ranking fixture (design §7, §12): never cut.
describe('ranking fixture (design §7)', () => {
  let app: INestApplication;
  let repository: PersonalRecordsRepository;
  const http = () => request(app.getHttpServer());

  // One bulk request; returns the ids in the order sent.
  async function logBulk(
    userId: string,
    exerciseName: string,
    entries: EntryBody[],
  ): Promise<string[]> {
    const res = withStatus(
      await http()
        .post(`/v1/users/${userId}/workout-entries/bulk`)
        .send({ entries: entries.map((e) => ({ ...e, exerciseName })) }),
      201,
    );
    return (res.body.data as { id: string }[]).map((e) => e.id);
  }

  const sqlWinners = (set: RecordSet): Record<PrMetric, Winner> => ({
    weight: set.weight && {
      entryId: set.weight.entry.id,
      setNumber: set.weight.setNumber,
    },
    volume: set.volume && {
      entryId: set.volume.entry.id,
      setNumber: set.volume.setNumber,
    },
    e1rm: set.e1rm && {
      entryId: set.e1rm.entry.id,
      setNumber: set.e1rm.setNumber,
    },
  });

  // pickRecord over every stored set of the exercise.
  async function domainWinners(
    userId: string,
    key: string,
  ): Promise<Record<PrMetric, Winner>> {
    const candidates = await storedCandidates(userId, key);
    const pick = (metric: PrMetric): Winner => {
      const best = pickRecord(metric, candidates);
      return best && { entryId: best.entryId, setNumber: best.setNumber };
    };
    return {
      weight: pick('weight'),
      volume: pick('volume'),
      e1rm: pick('e1rm'),
    };
  }

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
    repository = app.get(PersonalRecordsRepository);
  });

  it('SQL and pickRecord pick the same entry and set for all three records', async () => {
    const userId = uniqueUserId('rank');
    for (const scenario of SCENARIOS) {
      const ids = await logBulk(userId, scenario.name, scenario.entries);
      const key = scenario.name.toLowerCase();
      const fromSql = sqlWinners(await repository.findRecords(userId, key, {}));
      expect({ scenario: scenario.name, winners: fromSql }).toEqual({
        scenario: scenario.name,
        winners: await domainWinners(userId, key),
      });
      // The fixture tests what it says: the expected sets win.
      for (const metric of METRICS) {
        const [entry, setNumber] = scenario.expected[metric];
        expect({
          scenario: scenario.name,
          metric,
          winner: fromSql[metric],
        }).toEqual({
          scenario: scenario.name,
          metric,
          winner: { entryId: ids[entry], setNumber },
        });
      }
    }
  });

  // fast-check, the first item on the cut list (§16).
  it('the SQL ranking and pickRecord pick the same winner for generated sets', async () => {
    // Instants from a small pool and weights on a coarse grid, so equal
    // scores are common: 40 kg × 3 and 20 kg × 6 on volume, 60 kg × 2 and
    // 40 kg × 18 on estimated 1RM (60 × 32 = 40 × 48), and zero ties zero.
    const instants = [D1, D2, '2025-02-05T06:00:00.001+07:00'];
    const set = fc.oneof(
      fc.record({
        reps: fc.integer({ min: 1, max: 30 }),
        weight: fc.integer({ min: 0, max: 6 }).map((k) => 20 * k),
        unit: fc.constant('kg'),
      }),
      fc.record({
        reps: fc.integer({ min: 1, max: 30 }),
        weight: fc.integer({ min: 0, max: 6 }).map((k) => 45 * k),
        unit: fc.constant('lb'),
      }),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            date: fc.constantFrom(...instants),
            sets: fc.array(set, { minLength: 1, maxLength: 4 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (entries) => {
          const userId = uniqueUserId('gen');
          await logBulk(userId, 'Bench Press', entries);
          const fromSql = sqlWinners(
            await repository.findRecords(userId, 'bench press', {}),
          );
          expect(fromSql).toEqual(await domainWinners(userId, 'bench press'));
        },
      ),
      { numRuns: 25 },
    );
  });
});
