// src/units/weight-units.ts — the ONLY place a unit is defined
// Columns aligned as in design §6.
// prettier-ignore
export const WEIGHT_UNITS = [
  { code: 'kg', label: 'Kilogram', kgPerUnit: '1',          aliases: ['kgs'] },
  { code: 'lb', label: 'Pound',    kgPerUnit: '0.45359237', aliases: ['lbs'] },   // exact by definition (1959)
  // { code: 'st', label: 'Stone', kgPerUnit: '6.35029318', aliases: ['stone'] }, // adding stone = this line
] as const;

export type UnitCode = (typeof WEIGHT_UNITS)[number]['code'];

export type WeightUnit = {
  code: string;
  label: string;
  kgPerUnit: string;
  aliases: readonly string[];
};
