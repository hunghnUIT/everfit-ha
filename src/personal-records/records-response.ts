import type Decimal from 'decimal.js';
import { D, display } from '../common/decimal';
import { UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import { formatUtcOffset } from '../workouts/domain/dates';
import { e1rmKg, KgSet, volumeKg } from '../workouts/domain/metrics';
import { NewSet } from '../workouts/entry-input';
import type { RecordRow, RecordSet } from './personal-records.repository';

// The fields every record shows (design §9.3).
export type RecordSetJson = {
  weight: number;
  reps: number;
  unit: UnitCode;
  original: { weight: number; unit: UnitCode };
  date: string;
  utcOffset: string | null;
  entryId: string;
  setNumber: number;
};

// The `records` object of design §9.3; the service adds exercise, unit and
// range around it.
export type RecordsJson = {
  heaviestSet: RecordSetJson | null;
  highestVolumeSet: ({ volume: number } & RecordSetJson) | null;
  bestEstimatedOneRepMax:
    ({ estimatedOneRepMax: number } & RecordSetJson) | null;
};

// A record's set, out of its entry's sets, with the record's own fields.
// The weight follows toEntryResponse (Task 10b): in the set's own unit it is
// the number as sent, so 100.125 stays 100.125; in another unit it is
// converted from the exact kilograms and rounded half-up to two decimals.
// `original` always carries the number as sent.
function readRecord(
  row: RecordRow,
  unit: UnitCode,
  units: UnitRegistry,
): { kg: KgSet; json: RecordSetJson } {
  const set: NewSet | undefined = row.entry.sets.find(
    (s) => s.setNumber === row.setNumber,
  );
  if (set === undefined) {
    throw new Error(`Entry ${row.entry.id} has no set ${row.setNumber}`);
  }
  const kg = { reps: set.reps, weightKg: new D(set.weightKg) };
  const asSent = new D(set.weight).toNumber();
  return {
    kg,
    json: {
      weight:
        set.unit === unit ? asSent : display(units.fromKg(kg.weightKg, unit)),
      reps: set.reps,
      unit,
      original: { weight: asSent, unit: set.unit },
      date: row.entry.performedAt.toISOString(),
      utcOffset: formatUtcOffset(row.entry.utcOffsetMinutes),
      entryId: row.entry.id,
      setNumber: set.setNumber,
    },
  };
}

// Pure. Volume and the estimated 1RM are computed on the exact kilograms,
// converted, and rounded once, last (§7): 6 lb × 50 is 300 lb, where a volume
// rounded in kg first (136.08) would read 300.01. A set logged in the
// requested unit converts back exactly, so it shows its own product.
export function toRecordsResponse(
  records: RecordSet,
  unit: UnitCode,
  units: UnitRegistry,
): RecordsJson {
  const shown = (kg: Decimal) => display(units.fromKg(kg, unit));
  const read = (row: RecordRow | null) => row && readRecord(row, unit, units);
  const heaviest = read(records.weight);
  const volume = read(records.volume);
  const e1rm = read(records.e1rm);
  return {
    heaviestSet: heaviest && heaviest.json,
    highestVolumeSet: volume && {
      volume: shown(volumeKg(volume.kg)),
      ...volume.json,
    },
    bestEstimatedOneRepMax: e1rm && {
      estimatedOneRepMax: shown(e1rmKg(e1rm.kg)),
      ...e1rm.json,
    },
  };
}
