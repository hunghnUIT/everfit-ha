import { Check, FieldError } from '../common/problem';
import { readExerciseTerm } from '../exercises/name-rules';
import { UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import {
  checkRange,
  parseReadBound,
  repairOffsetPlus,
} from '../workouts/domain/dates';
import { CompareQueryDto } from './dto/compare-query.dto';
import { readUnit } from './records-query';

// One period of a comparison: both bounds are required (design §9.4).
export type ComparePeriod = { from: Date; to: Date };

// A comparison request after every check. `key` is the exercise as
// normalised, matched as the whole name.
export type CompareQuery = {
  key: string;
  current: ComparePeriod;
  previous: ComparePeriod;
  unit: UnitCode;
};

// The four bounds: the query path of each, and which advice a date alone
// gets (§8: the `to` advice would drop a day on a start).
const BOUNDS = [
  ['from', 'from'],
  ['to', 'to'],
  ['compareFrom', 'from'],
  ['compareTo', 'to'],
] as const;

type BoundPath = (typeof BOUNDS)[number][0];

// What class-validator cannot check: the dates (the `+` repaired first, §8)
// and the unit's canonical code. Each pair goes through the same range check
// as history after rounding, with the error on its start; the two periods may
// overlap. Every fault is reported at once. `q` has passed CompareQueryDto,
// so the exercise and the four bounds are non-empty strings.
export function readCompareQuery(
  q: CompareQueryDto,
  units: UnitRegistry,
): Check<CompareQuery> {
  const errors: FieldError[] = [];
  const term = readExerciseTerm(q.exercise, 'exercise');
  if (!term.ok) errors.push(...term.errors);
  const read: Partial<Record<BoundPath, Date>> = {};
  for (const [path, bound] of BOUNDS) {
    const parsed = parseReadBound(repairOffsetPlus(q[path]), path, bound);
    if (parsed.ok) read[path] = parsed.value;
    else errors.push(...parsed.errors);
  }
  errors.push(...checkRange(read.from, read.to, 'from', 'to'));
  errors.push(
    ...checkRange(read.compareFrom, read.compareTo, 'compareFrom', 'compareTo'),
  );
  const unit = readUnit(q.unit, units);
  if (!unit.ok) errors.push(...unit.errors);

  const { from, to, compareFrom, compareTo } = read;
  if (
    errors.length > 0 ||
    !term.ok ||
    !unit.ok ||
    from === undefined ||
    to === undefined ||
    compareFrom === undefined ||
    compareTo === undefined
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      key: term.value,
      current: { from, to },
      previous: { from: compareFrom, to: compareTo },
      unit: unit.value,
    },
  };
}
