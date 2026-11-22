import { UnitRegistry } from '../units/unit-registry';
import type { StoredEntry } from '../workouts/workouts.repository';
import type { RecordRow, RecordSet } from './personal-records.repository';
import { toRecordsResponse } from './records-response';

const units = new UnitRegistry();

// One stored entry with one set, as the repository reads it back: the weights
// are the exact decimal strings of the database.
function rowWith(set: {
  reps: number;
  weight: string;
  unit: 'kg' | 'lb';
  weightKg: string;
}): RecordRow {
  const entry: StoredEntry = {
    id: '0194f2fe-0000-7000-8000-000000000001',
    userId: 'u_123',
    exerciseName: 'Bench Press',
    exerciseKey: 'bench press',
    performedAt: new Date('2025-01-02T11:05:00.000Z'),
    utcOffsetMinutes: 420,
    createdAt: new Date('2025-01-02T11:06:00.000Z'),
    sets: [{ setNumber: 1, ...set }],
  };
  return { entry, setNumber: 1 };
}

// The one set holds all three records.
const allThree = (row: RecordRow): RecordSet => ({
  weight: row,
  volume: row,
  e1rm: row,
});

const SHARED = {
  date: '2025-01-02T11:05:00.000Z',
  utcOffset: '+07:00',
  entryId: '0194f2fe-0000-7000-8000-000000000001',
  setNumber: 1,
};

describe('toRecordsResponse (design §6, §7, §9.3)', () => {
  // Volume is converted from the unrounded product and rounded last: rounded
  // in kg first (136.08), it would read 300.01 lb.
  it('6 lb × 50 read in lb → highestVolumeSet.volume 300', () => {
    const row = rowWith({
      reps: 50,
      weight: '6.000',
      unit: 'lb',
      weightKg: '2.72155422000',
    });
    expect(
      toRecordsResponse(allThree(row), 'lb', units).highestVolumeSet,
    ).toEqual({
      volume: 300,
      weight: 6,
      reps: 50,
      unit: 'lb',
      original: { weight: 6, unit: 'lb' },
      ...SHARED,
    });
  });

  it('100.125 kg × 1 read in kg → weight 100.125 as sent, volume 100.13', () => {
    const row = rowWith({
      reps: 1,
      weight: '100.125',
      unit: 'kg',
      weightKg: '100.12500000000',
    });
    const fields = {
      weight: 100.125,
      reps: 1,
      unit: 'kg',
      original: { weight: 100.125, unit: 'kg' },
      ...SHARED,
    };
    expect(toRecordsResponse(allThree(row), 'kg', units)).toEqual({
      heaviestSet: fields,
      highestVolumeSet: { volume: 100.13, ...fields },
      // 100.125 × 31 / 30 = 103.4625
      bestEstimatedOneRepMax: { estimatedOneRepMax: 103.46, ...fields },
    });
  });
});
