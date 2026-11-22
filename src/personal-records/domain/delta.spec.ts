import { D } from '../../common/decimal';
import { UnitRegistry } from '../../units/unit-registry';
import { e1rmKg } from '../../workouts/domain/metrics';
import { computeDelta } from './delta';

const units = new UnitRegistry();

// Design §9.4: a delta compares the headline numbers of one record, current
// minus previous, from the exact kilograms, and rounds last.
describe('computeDelta (design §9.4)', () => {
  it('current 101 kg × 1 vs previous 100 kg × 1: estimated maxima shown as 104.37 and 103.33 give { absolute: 1.03, percent: 1 }', () => {
    const current = e1rmKg({ reps: 1, weightKg: new D(101) });
    const previous = e1rmKg({ reps: 1, weightKg: new D(100) });
    // From the exact values; subtracting the shown values would give 1.04.
    expect(computeDelta(current, previous, 'kg', units)).toEqual({
      absolute: 1.03,
      percent: 1,
    });
  });

  it('previous 0 → percent null; either side null → null', () => {
    // A bodyweight set logged with weight 0 (§9.4).
    expect(computeDelta(new D(20), new D(0), 'kg', units)).toEqual({
      absolute: 20,
      percent: null,
    });
    expect(computeDelta(null, new D(100), 'kg', units)).toBeNull();
    expect(computeDelta(new D(100), null, 'kg', units)).toBeNull();
    expect(computeDelta(null, null, 'kg', units)).toBeNull();
  });
});
