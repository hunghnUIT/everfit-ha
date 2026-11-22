import { D, display } from '../common/decimal';
import { CatalogSnapshot } from '../exercises/catalog-snapshot';
import { UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import { formatUtcOffset } from './domain/dates';
import { NewSet } from './entry-input';
import type { StoredEntry } from './workouts.repository';

export type SetResponse = {
  setNumber: number;
  reps: number;
  weight: number;
  unit: UnitCode;
  original: { weight: number; unit: UnitCode };
};

// The `data` object of design §9.1, for the POST and the GET alike.
export type EntryResponse = {
  id: string;
  userId: string;
  exerciseName: string;
  exerciseKey: string;
  muscleGroups: string[];
  date: string;
  utcOffset: string | null;
  sets: SetResponse[];
  createdAt: string;
};

// The number as sent: an exact decimal string turned into a number once, here.
const asSent = (text: string) => new D(text).toNumber();

// Design §6: in the set's own unit the weight is the number as sent, so it
// never drifts; in another unit it is converted from the exact kilograms and
// rounded half-up to two decimals. `original` always carries the number as sent.
function toSetResponse(
  set: NewSet,
  unit: UnitCode,
  units: UnitRegistry,
): SetResponse {
  const original = { weight: asSent(set.weight), unit: set.unit };
  return {
    setNumber: set.setNumber,
    reps: set.reps,
    weight:
      set.unit === unit
        ? original.weight
        : display(units.fromKg(new D(set.weightKg), unit)),
    unit,
    original,
  };
}

// Pure: the muscle groups come from the one snapshot the request took.
export function toEntryResponse(
  e: StoredEntry,
  unit: UnitCode,
  snapshot: CatalogSnapshot,
  units: UnitRegistry,
): EntryResponse {
  return {
    id: e.id,
    userId: e.userId,
    exerciseName: e.exerciseName,
    exerciseKey: e.exerciseKey,
    muscleGroups: [...snapshot.muscleGroupsFor(e.exerciseKey)],
    date: e.performedAt.toISOString(),
    utcOffset: formatUtcOffset(e.utcOffsetMinutes),
    sets: e.sets.map((set) => toSetResponse(set, unit, units)),
    createdAt: e.createdAt.toISOString(),
  };
}
