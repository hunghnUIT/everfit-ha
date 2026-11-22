import { D, decimalFromNumber, display } from '../../common/decimal';
import { UnitRegistry } from '../../units/unit-registry';
import { CandidateSet, e1rmKg, pickRecord, rank, volumeKg } from './metrics';

const ID_A = '01950000-0000-7000-8000-000000000001';
const ID_B = '01950000-0000-7000-8000-000000000002';
const EARLY = new Date('2025-02-10T09:00:00.000Z');
const LATE = new Date('2025-02-12T09:00:00.000Z');

function candidate(over: Partial<CandidateSet>): CandidateSet {
  return {
    reps: 5,
    weightKg: new D(100),
    entryId: ID_A,
    performedAt: EARLY,
    setNumber: 1,
    ...over,
  };
}

describe('metrics (design §7)', () => {
  it.each([
    [1, 103.33],
    [2, 106.67],
    [10, 133.33],
    [30, 200],
  ])('Epley 100 kg × %i → %p', (reps, expected) =>
    expect(display(e1rmKg({ reps, weightKg: new D(100) }))).toBe(expected),
  );

  it('computes the volume as reps × weight, exactly', () =>
    expect(volumeKg({ reps: 8, weightKg: new D('102.5') }).toString()).toBe(
      '820',
    ));

  it('ranks by the weight, weight × reps and weight × (30 + reps)', () => {
    const s = { reps: 5, weightKg: new D('102.5') };
    expect(rank('weight', s).toString()).toBe('102.5');
    expect(rank('volume', s).toString()).toBe('512.5');
    expect(rank('e1rm', s).toString()).toBe('3587.5');
  });

  it('100 kg × 1 beats 96 kg × 2 (103.33 vs 102.40)', () => {
    const single = candidate({ reps: 1, weightKg: new D(100), entryId: ID_B });
    const double = candidate({ reps: 2, weightKg: new D(96), entryId: ID_A });
    expect(display(e1rmKg(single))).toBe(103.33);
    expect(display(e1rmKg(double))).toBe(102.4);
    expect(pickRecord('e1rm', [double, single])).toBe(single);
  });

  it('a zero-weight set ranks 0 and can still be the record', () => {
    const bodyweight = candidate({ reps: 12, weightKg: new D(0) });
    expect(rank('weight', bodyweight).toString()).toBe('0');
    expect(rank('volume', bodyweight).toString()).toBe('0');
    expect(rank('e1rm', bodyweight).toString()).toBe('0');
    expect(pickRecord('weight', [bodyweight])).toBe(bodyweight);
    expect(pickRecord('e1rm', [bodyweight])).toBe(bodyweight);
  });

  it('returns null when there is no set', () =>
    expect(pickRecord('volume', [])).toBeNull());

  it('ties go to the earliest instant, then the lowest id, then the lowest set number', () => {
    const lateLowId = candidate({ performedAt: LATE, entryId: ID_A });
    const earlyHighId = candidate({ performedAt: EARLY, entryId: ID_B });
    expect(pickRecord('weight', [lateLowId, earlyHighId])).toBe(earlyHighId);

    const sameInstantHighId = candidate({ entryId: ID_B, setNumber: 1 });
    const sameInstantLowId = candidate({ entryId: ID_A, setNumber: 3 });
    expect(pickRecord('volume', [sameInstantHighId, sameInstantLowId])).toBe(
      sameInstantLowId,
    );

    const thirdSet = candidate({ setNumber: 3 });
    const secondSet = candidate({ setNumber: 2 });
    expect(pickRecord('e1rm', [thirdSet, secondSet])).toBe(secondSet);
  });

  it('a higher score wins over an earlier instant', () => {
    const earlyLight = candidate({ performedAt: EARLY, weightKg: new D(100) });
    const lateHeavy = candidate({
      performedAt: LATE,
      weightKg: new D('100.5'),
    });
    expect(pickRecord('weight', [earlyLight, lateHeavy])).toBe(lateHeavy);
  });

  it('compares instants to the millisecond: on one day the earlier entry wins over a lower id', () => {
    // 09:00 and 16:00 in Hanoi, the same calendar day in UTC too.
    const morning = candidate({
      performedAt: new Date('2025-02-10T02:00:00.000Z'),
      entryId: ID_B,
    });
    const afternoon = candidate({
      performedAt: new Date('2025-02-10T09:00:00.000Z'),
      entryId: ID_A,
    });
    expect(pickRecord('weight', [afternoon, morning])).toBe(morning);
  });

  it('the three metrics crown three different sets: 100 × 1, 60 × 10, 90 × 5', () => {
    const single = candidate({ reps: 1, weightKg: new D(100), setNumber: 1 });
    const tens = candidate({ reps: 10, weightKg: new D(60), setNumber: 2 });
    const fives = candidate({ reps: 5, weightKg: new D(90), setNumber: 3 });
    const sets = [single, tens, fives];
    // weight: 100 > 90 > 60
    expect(pickRecord('weight', sets)).toBe(single);
    // volume: 600 > 450 > 100
    expect(rank('volume', tens).toString()).toBe('600');
    expect(pickRecord('volume', sets)).toBe(tens);
    // e1rm rank: 90 × 35 = 3150 > 100 × 31 = 3100 > 60 × 40 = 2400
    expect(rank('e1rm', fives).toString()).toBe('3150');
    expect(rank('e1rm', single).toString()).toBe('3100');
    expect(pickRecord('e1rm', sets)).toBe(fives);
  });

  describe('pound ties (exact kg through UnitRegistry)', () => {
    const reg = new UnitRegistry();
    const lbSet = (pounds: number, reps: number, over: Partial<CandidateSet>) =>
      candidate({
        reps,
        weightKg: reg.toKg(decimalFromNumber(pounds), 'lb'),
        ...over,
      });

    it('100 lb × 10, then 200 lb × 5 later: the first keeps the volume record', () => {
      const first = lbSet(100, 10, { performedAt: EARLY, entryId: ID_B });
      const later = lbSet(200, 5, { performedAt: LATE, entryId: ID_A });
      expect(rank('volume', first).toString()).toBe('453.59237');
      expect(rank('volume', later).toString()).toBe('453.59237');
      expect(pickRecord('volume', [later, first])).toBe(first);
    });

    it('200 lb × 5, then 175 lb × 10 later: the first keeps the estimated-1RM record', () => {
      const first = lbSet(200, 5, { performedAt: EARLY, entryId: ID_B });
      const later = lbSet(175, 10, { performedAt: LATE, entryId: ID_A });
      expect(rank('e1rm', first).toString()).toBe('3175.14659');
      expect(rank('e1rm', later).toString()).toBe('3175.14659');
      expect(pickRecord('e1rm', [later, first])).toBe(first);
    });

    it('compares exact scores: 100 kg beats an earlier 220.462 lb (99.99988107494 kg, 100.00 once rounded)', () => {
      const earlierPounds = lbSet(220.462, 1, {
        performedAt: EARLY,
        entryId: ID_A,
      });
      const laterKilos = candidate({
        reps: 1,
        weightKg: new D(100),
        performedAt: LATE,
        entryId: ID_B,
      });
      expect(earlierPounds.weightKg.toString()).toBe('99.99988107494');
      expect(display(earlierPounds.weightKg)).toBe(100);
      expect(pickRecord('weight', [earlierPounds, laterKilos])).toBe(
        laterKilos,
      );
    });
  });
});
