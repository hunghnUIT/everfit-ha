import type Decimal from 'decimal.js';
import { display } from '../../common/decimal';
import { UnitRegistry } from '../../units/unit-registry';
import { UnitCode } from '../../units/weight-units';

export type Delta = { absolute: number; percent: number | null };

// Domain logic (design §9.4): one record's headline number, current minus
// previous, both given in exact kilograms. `absolute` is converted to the
// requested unit; `percent` has no unit. Both are rounded once, last, so a
// delta can differ by 0.01 from the difference of the two numbers shown.
// No delta without both sides; no percent of a previous 0 (a bodyweight set
// logged with weight 0).
export function computeDelta(
  current: Decimal | null,
  previous: Decimal | null,
  unit: UnitCode,
  units: UnitRegistry,
): Delta | null {
  if (current === null || previous === null) return null;
  const difference = current.minus(previous);
  return {
    absolute: display(units.fromKg(difference, unit)),
    percent: previous.isZero()
      ? null
      : display(difference.div(previous).times(100)),
  };
}
