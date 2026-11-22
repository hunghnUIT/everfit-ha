import { SQL, sql } from 'drizzle-orm';
import { decodeCursor } from '../common/cursor';
import { DEFAULT_PAGE_SIZE } from '../common/limits';
import { Check, FieldError } from '../common/problem';
import { workoutEntries as e } from '../database/schema';
import { pgArray } from '../database/sql';
import { CatalogSnapshot } from '../exercises/catalog-snapshot';
import { muscleGroupName } from '../exercises/exercise-key';
import { readExerciseTerm } from '../exercises/name-rules';
import { unsupportedUnitMessage } from '../units/is-supported-unit';
import { UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import { checkRange, parseReadBound, repairOffsetPlus } from './domain/dates';
import { HistoryQueryDto } from './dto/history-query.dto';

// A history request after every check (design §9.2). `term` is the
// normalised search text with LIKE's wildcards escaped; `keys` is the
// muscle group's exercise keys from the request's catalog snapshot.
export type HistoryQuery = {
  userId: string;
  from?: Date;
  to?: Date;
  term?: string;
  keys?: readonly string[];
  cursor?: { at: Date; id: string };
  limit: number;
  unit: UnitCode;
};

// LIKE's two wildcards and its escape character, each preceded by the escape
// character, so the term matches itself. A one-line helper: lodash has no
// LIKE escaper (escapeRegExp escapes a different set).
const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

const CURSOR_MESSAGE =
  'cursor is not one this API issued. Send the nextCursor of the previous ' +
  'page unchanged, or leave cursor out for the first page.';

// What class-validator cannot check: the dates (the `+` repaired first, §8),
// the cursor, and the muscle group against the snapshot the request took, so
// the 400 and the key list cannot disagree (§10.2). Every fault is reported
// at once. `q` has passed HistoryQueryDto.
export function readHistoryQuery(
  q: HistoryQueryDto,
  userId: string,
  snapshot: CatalogSnapshot,
  units: UnitRegistry,
): Check<HistoryQuery> {
  const errors: FieldError[] = [];
  const value: HistoryQuery = {
    userId,
    limit: q.limit ?? DEFAULT_PAGE_SIZE,
    unit: 'kg',
  };

  // An absent bound is no bound; parseReadBound would refuse undefined.
  for (const bound of ['from', 'to'] as const) {
    const raw = q[bound];
    if (raw === undefined) continue;
    const parsed = parseReadBound(repairOffsetPlus(raw), bound, bound);
    if (parsed.ok) value[bound] = parsed.value;
    else errors.push(...parsed.errors);
  }
  errors.push(...checkRange(value.from, value.to, 'from', 'to'));

  if (q.cursor !== undefined) {
    const cursor = decodeCursor(q.cursor);
    if (cursor === null)
      errors.push({ path: 'cursor', message: CURSOR_MESSAGE });
    else value.cursor = cursor;
  }

  if (q.muscleGroup !== undefined) {
    const group = muscleGroupName(q.muscleGroup);
    if (snapshot.hasMuscleGroup(group)) {
      value.keys = snapshot.keysForMuscleGroup(group);
    } else {
      errors.push({
        path: 'muscleGroup',
        message:
          `Unknown muscle group '${group}'. Known muscle groups: ` +
          `${snapshot.knownMuscleGroups().join(', ')}.`,
      });
    }
  }

  if (q.exercise !== undefined) {
    const term = readExerciseTerm(q.exercise, 'exercise');
    if (term.ok) value.term = escapeLike(term.value);
    else errors.push(...term.errors);
  }

  if (q.unit !== undefined) {
    const unit = units.resolve(q.unit);
    if (unit === null) {
      errors.push({
        path: 'unit',
        message: unsupportedUnitMessage(q.unit, units.describe()),
      });
    } else {
      value.unit = unit;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

// Step 1 of design §9.2: one page of ids, plus one row to tell whether there
// is more, with only the predicates that were requested. The select list is
// exactly the indexed columns, so it stays an index-only scan on
// ix_entries_history; another column would make it fetch heap rows. The
// benchmark explains this same statement. The backslash of ESCAPE is
// doubled inside the JavaScript string (§14, slice 10).
export function buildHistoryIdsQuery(q: HistoryQuery): SQL {
  const where: SQL[] = [sql`${e.userId} = ${q.userId}`];
  if (q.from !== undefined) {
    where.push(sql`${e.performedAt} >= ${q.from.toISOString()}::timestamptz`);
  }
  if (q.to !== undefined) {
    where.push(sql`${e.performedAt} < ${q.to.toISOString()}::timestamptz`);
  }
  if (q.term !== undefined) {
    where.push(sql`${e.exerciseKey} LIKE '%' || ${q.term} || '%' ESCAPE '\\'`);
  }
  if (q.keys !== undefined) {
    where.push(sql`${e.exerciseKey} = ANY(${pgArray(q.keys, 'text')})`);
  }
  if (q.cursor !== undefined) {
    where.push(
      sql`(${e.performedAt}, ${e.id}) < (${q.cursor.at.toISOString()}::timestamptz, ${q.cursor.id}::uuid)`,
    );
  }
  return sql`SELECT ${e.id}, ${e.performedAt}, ${e.exerciseKey} FROM ${e} WHERE ${sql.join(where, sql` AND `)} ORDER BY ${e.performedAt} DESC, ${e.id} DESC LIMIT ${q.limit + 1}`;
}
