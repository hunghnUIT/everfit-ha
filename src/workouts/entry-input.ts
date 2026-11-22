import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type Decimal from 'decimal.js';
import isPlainObject from 'lodash/isPlainObject';
import { v7 } from 'uuid';
import { decimalFromNumber, decimalPlaces } from '../common/decimal';
import { MAX_WEIGHT_DECIMALS } from '../common/limits';
import { Check, FieldError } from '../common/problem';
import { toFieldErrors, VALIDATOR_OPTIONS } from '../common/validation';
import { checkExerciseName } from '../exercises/name-rules';
import { unsupportedUnitMessage } from '../units/is-supported-unit';
import { UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import { parseWriteDate } from './domain/dates';
import {
  BulkInputDto,
  EntryInputDto,
  SetInputDto,
  SHAPE_MESSAGES,
} from './dto/entry-input.dto';

// Weights are exact decimal strings; setNumber is the position in the request,
// from 1.
export type NewSet = {
  setNumber: number;
  reps: number;
  weight: string;
  unit: UnitCode;
  weightKg: string;
};

export type NewEntry = {
  id: string;
  userId: string;
  exerciseName: string;
  exerciseKey: string;
  performedAt: Date;
  utcOffsetMinutes: number | null;
  sets: NewSet[];
};

type Deps = { units: UnitRegistry; now: Temporal.Instant };

type Draft = Omit<NewEntry, 'id' | 'userId'>;

// `path` is `base` or lies inside it: sets[0].unit is under sets and sets[0].
function isUnder(path: string, base: string): boolean {
  return (
    path === base || path.startsWith(`${base}.`) || path.startsWith(`${base}[`)
  );
}

const join = (prefix: string, key: string) =>
  prefix ? `${prefix}.${key}` : key;

// Step 1: the shape class-validator does not word or does not catch. A
// nested array passes its ValidateNested, so each entry and each set is
// checked to be an object here.
function shapeErrors(item: unknown, prefix: string): FieldError[] {
  if (!isPlainObject(item)) {
    return [{ path: prefix, message: SHAPE_MESSAGES.entry }];
  }
  const sets: unknown = (item as Record<string, unknown>).sets;
  if (!Array.isArray(sets)) return [];
  return sets.flatMap((set, j) =>
    isPlainObject(set)
      ? []
      : [
          {
            path: `${join(prefix, 'sets')}[${j}]`,
            message: SHAPE_MESSAGES.set,
          },
        ],
  );
}

// Step 3 for one item. Each check runs only when its field has no shape or
// DTO error (`failed`), so a field gets one error and the values read here
// have the types the DTO checked. Returns the draft when every check passed.
function readItem(
  item: EntryInputDto,
  prefix: string,
  pathUserId: string,
  deps: Deps,
  failed: (path: string) => boolean,
  errors: FieldError[],
): Draft | undefined {
  const at = (key: string) => join(prefix, key);
  const date = failed(at('date'))
    ? undefined
    : parseWriteDate(item.date, at('date'), deps.now);
  const name = failed(at('exerciseName'))
    ? undefined
    : checkExerciseName(item.exerciseName, at('exerciseName'));
  for (const check of [date, name]) {
    if (check?.ok === false) errors.push(...check.errors);
  }
  // The cross-field rule reads userId alone (null counts as absent, as
  // @IsOptional treats it).
  const userId = item.userId;
  if (
    !failed(at('userId')) &&
    userId !== undefined &&
    userId !== null &&
    userId !== pathUserId
  ) {
    errors.push({
      path: at('userId'),
      message: `'${userId}' does not match the userId in the path, '${pathUserId}'.`,
    });
  }
  const sets = failed(at('sets'))
    ? undefined
    : item.sets.map((set, j) =>
        readSet(set, j, `${at('sets')}[${j}]`, deps.units, failed, errors),
      );
  if (!date?.ok || !name?.ok || sets === undefined) return undefined;
  const complete = sets.filter((set) => set !== undefined);
  if (complete.length !== sets.length) return undefined;
  return {
    exerciseName: name.value.name,
    exerciseKey: name.value.key,
    performedAt: date.value.performedAt,
    utcOffsetMinutes: date.value.utcOffsetMinutes,
    sets: complete,
  };
}

function readSet(
  set: SetInputDto,
  index: number,
  path: string,
  units: UnitRegistry,
  failed: (path: string) => boolean,
  errors: FieldError[],
): NewSet | undefined {
  let weight: Decimal | undefined;
  if (!failed(`${path}.weight`)) {
    // On the number's shortest text (§6): class-validator's maxDecimalPlaces
    // is not trusted with exponent notation such as 1e-7.
    const places = decimalPlaces(set.weight);
    if (places > MAX_WEIGHT_DECIMALS) {
      errors.push({
        path: `${path}.weight`,
        message: `weight must have at most ${MAX_WEIGHT_DECIMALS} decimal places; ${String(set.weight)} has ${places}.`,
      });
    } else {
      weight = decimalFromNumber(set.weight);
    }
  }
  let unit: UnitCode | null = null;
  if (!failed(`${path}.unit`)) {
    unit = units.resolve(set.unit);
    if (unit === null) {
      errors.push({
        path: `${path}.unit`,
        message: unsupportedUnitMessage(set.unit, units.describe()),
      });
    }
  }
  if (weight === undefined || unit === null || failed(`${path}.reps`)) {
    return undefined;
  }
  return {
    setNumber: index + 1,
    reps: set.reps,
    // Decimal's toFixed() with no argument: plain notation, no rounding.
    weight: weight.toFixed(),
    unit,
    weightKg: units.toKg(weight, unit).toFixed(),
  };
}

// Turns a request body into validated entries, or into every field error of
// the request at once (design §9.1). Pure: no Nest, no database; the clock
// and the unit registry are passed in. Never throws for any JSON value.
export function readEntryInputs(
  body: unknown,
  shape: 'single' | 'bulk',
  pathUserId: string,
  deps: Deps,
): Check<NewEntry[]> {
  if (!isPlainObject(body)) {
    const message =
      shape === 'single' ? SHAPE_MESSAGES.singleBody : SHAPE_MESSAGES.bulkBody;
    return { ok: false, errors: [{ path: '', message }] };
  }
  const raw = body as Record<string, unknown>;
  const rawItems: unknown[] =
    shape === 'single' ? [raw] : Array.isArray(raw.entries) ? raw.entries : [];
  const prefixes = rawItems.map((_, i) =>
    shape === 'single' ? '' : `entries[${i}]`,
  );

  // Steps 1 and 2. A DTO error at or inside a path that already failed is
  // dropped, so each path has one error.
  const inputErrors = rawItems.flatMap((item, i) =>
    shapeErrors(item, prefixes[i]),
  );
  const failed = (path: string) =>
    inputErrors.some((error) => isUnder(path, error.path));
  const dto =
    shape === 'single'
      ? plainToInstance(EntryInputDto, raw)
      : plainToInstance(BulkInputDto, raw);
  for (const error of toFieldErrors(validateSync(dto, VALIDATOR_OPTIONS))) {
    if (!failed(error.path)) inputErrors.push(error);
  }
  // Indexed as rawItems: entries is an array whenever rawItems is not empty.
  const items = dto instanceof BulkInputDto ? dto.entries : [dto];

  // Step 3, on the items that are objects and whose path did not fail.
  const domainErrors: FieldError[] = [];
  const drafts = rawItems.map((_, i) =>
    failed(prefixes[i])
      ? undefined
      : readItem(items[i], prefixes[i], pathUserId, deps, failed, domainErrors),
  );
  const errors = [...inputErrors, ...domainErrors];
  if (errors.length > 0) return { ok: false, errors };
  // With no error, every item gave a draft. Ids are made here, in input order.
  return {
    ok: true,
    value: drafts.flatMap((draft) =>
      draft === undefined ? [] : [{ id: v7(), userId: pathUserId, ...draft }],
    ),
  };
}
