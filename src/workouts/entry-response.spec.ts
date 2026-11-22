import { CatalogSnapshot } from '../exercises/catalog-snapshot';
import { UnitRegistry } from '../units/unit-registry';
import { StoredEntry, toEntryResponse } from './entry-response';

const units = new UnitRegistry();

const snapshot = new CatalogSnapshot(
  {
    exercises: [
      {
        key: 'bench press',
        name: 'Bench Press',
        muscleGroups: ['chest', 'shoulders', 'triceps'],
      },
    ],
    groups: ['chest', 'shoulders', 'triceps'],
  },
  1,
);

// One stored entry with one set, as the repository reads it back: the weights
// are the exact decimal strings of the database.
function storedWith(set: {
  weight: string;
  unit: 'kg' | 'lb';
  weightKg: string;
}): StoredEntry {
  return {
    id: '0194f2fe-0000-7000-8000-000000000001',
    userId: 'u_123',
    exerciseName: 'Bench Press',
    exerciseKey: 'bench press',
    performedAt: new Date('2025-02-09T22:30:00.000Z'),
    utcOffsetMinutes: 420,
    createdAt: new Date('2025-02-11T03:12:45.120Z'),
    sets: [{ setNumber: 1, reps: 5, ...set }],
  };
}

describe('toEntryResponse (design §6, §9.1)', () => {
  it('225 lb read in kg shows 102.06 with original { weight: 225, unit: "lb" }', () => {
    const e = storedWith({
      weight: '225.000',
      unit: 'lb',
      weightKg: '102.05828325000',
    });
    expect(toEntryResponse(e, 'kg', snapshot, units)).toEqual({
      id: '0194f2fe-0000-7000-8000-000000000001',
      userId: 'u_123',
      exerciseName: 'Bench Press',
      exerciseKey: 'bench press',
      muscleGroups: ['chest', 'shoulders', 'triceps'],
      date: '2025-02-09T22:30:00.000Z',
      utcOffset: '+07:00',
      sets: [
        {
          setNumber: 1,
          reps: 5,
          weight: 102.06,
          unit: 'kg',
          original: { weight: 225, unit: 'lb' },
        },
      ],
      createdAt: '2025-02-11T03:12:45.120Z',
    });
  });

  it('100.125 kg read in kg shows 100.125, the number as sent, not 100.13', () => {
    const e = storedWith({
      weight: '100.125',
      unit: 'kg',
      weightKg: '100.12500000000',
    });
    expect(toEntryResponse(e, 'kg', snapshot, units).sets).toEqual([
      {
        setNumber: 1,
        reps: 5,
        weight: 100.125,
        unit: 'kg',
        original: { weight: 100.125, unit: 'kg' },
      },
    ]);
  });

  it('100.125 kg read in lb shows display(fromKg) and keeps original { weight: 100.125, unit: "kg" }', () => {
    const e = storedWith({
      weight: '100.125',
      unit: 'kg',
      weightKg: '100.12500000000',
    });
    // 100.125 / 0.45359237 = 220.7376…, half-up to two decimals.
    expect(toEntryResponse(e, 'lb', snapshot, units).sets).toEqual([
      {
        setNumber: 1,
        reps: 5,
        weight: 220.74,
        unit: 'lb',
        original: { weight: 100.125, unit: 'kg' },
      },
    ]);
  });

  it('an exercise not in the catalog shows no muscle groups, and Z gives utcOffset null', () => {
    const e = {
      ...storedWith({ weight: '0', unit: 'kg', weightKg: '0' }),
      exerciseKey: 'zercher squat',
      utcOffsetMinutes: null,
    };
    const res = toEntryResponse(e, 'kg', snapshot, units);
    expect(res.muscleGroups).toEqual([]);
    expect(res.utcOffset).toBeNull();
  });
});
