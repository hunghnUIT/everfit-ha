import { SQL, sql } from 'drizzle-orm';
import { Check, FieldError } from '../common/problem';
import { exerciseKey } from '../exercises/exercise-key';
import { unsupportedUnitMessage } from '../units/is-supported-unit';
import { UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import {
  checkRange,
  parseReadBound,
  repairOffsetPlus,
} from '../workouts/domain/dates';
import { RecordsQueryDto } from './dto/records-query.dto';

// The instants a records request is limited to; each bound is optional.
export type RecordsRange = { from?: Date; to?: Date };

// A records request after every check (design §9.3). `key` is the exercise
// as normalised, matched as the whole name.
export type RecordsQuery = RecordsRange & { key: string; unit: UnitCode };

// What class-validator cannot check: the dates (the `+` repaired first, §8)
// and the unit's canonical code. Every fault is reported at once. `q` has
// passed RecordsQueryDto, so `exercise` is a non-empty string.
export function readRecordsQuery(
  q: RecordsQueryDto,
  units: UnitRegistry,
): Check<RecordsQuery> {
  const errors: FieldError[] = [];
  const value: RecordsQuery = { key: exerciseKey(q.exercise), unit: 'kg' };

  // An absent bound is no bound; parseReadBound would refuse undefined.
  for (const bound of ['from', 'to'] as const) {
    const raw = q[bound];
    if (raw === undefined) continue;
    const parsed = parseReadBound(repairOffsetPlus(raw), bound, bound);
    if (parsed.ok) value[bound] = parsed.value;
    else errors.push(...parsed.errors);
  }
  errors.push(...checkRange(value.from, value.to, 'from', 'to'));

  const unit = readUnit(q.unit, units);
  if (unit.ok) value.unit = unit.value;
  else errors.push(...unit.errors);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

// The `unit` parameter of the records and compare queries as its canonical
// code; absent means kg.
export function readUnit(
  raw: string | undefined,
  units: UnitRegistry,
): Check<UnitCode> {
  if (raw === undefined) return { ok: true, value: 'kg' };
  const unit = units.resolve(raw);
  return unit === null
    ? {
        ok: false,
        errors: [
          {
            path: 'unit',
            message: unsupportedUnitMessage(raw, units.describe()),
          },
        ],
      }
    : { ok: true, value: unit };
}

// The statement of design §9.3: the join is evaluated once and materialised,
// and each of the three picks reads that result. The scores are exact
// numeric products, the same three as rank() (§7), with the same tie-break:
// earliest instant, then lowest id, then lowest set number. Date predicates
// are added only when sent. The benchmark explains this same statement.
export function buildRecordsQuery(
  userId: string,
  key: string,
  range: RecordsRange,
): SQL {
  const where: SQL[] = [
    sql`e.user_id = ${userId}`,
    sql`e.exercise_key = ${key}`,
  ];
  if (range.from !== undefined) {
    where.push(sql`e.performed_at >= ${range.from.toISOString()}::timestamptz`);
  }
  if (range.to !== undefined) {
    where.push(sql`e.performed_at < ${range.to.toISOString()}::timestamptz`);
  }
  return sql`WITH scoped AS MATERIALIZED (
  SELECT e.id, e.performed_at, s.set_number, s.reps, s.weight_kg
  FROM workout_entries e
  JOIN workout_sets s ON s.entry_id = e.id
  WHERE ${sql.join(where, sql` AND `)} )
(SELECT 'weight' AS record, id, set_number FROM scoped
   ORDER BY weight_kg DESC,               performed_at, id, set_number LIMIT 1)
UNION ALL
(SELECT 'volume', id, set_number FROM scoped
   ORDER BY weight_kg * reps DESC,        performed_at, id, set_number LIMIT 1)
UNION ALL
(SELECT 'e1rm',   id, set_number FROM scoped
   ORDER BY weight_kg * (30 + reps) DESC, performed_at, id, set_number LIMIT 1)`;
}
