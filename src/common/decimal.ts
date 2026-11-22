import Decimal from 'decimal.js';

// 40 significant digits (the largest ranking product has 18), set on the
// library itself and so process-wide on purpose: it removes the question of
// which constructor a value was built with (design §6). Any module doing
// decimal arithmetic imports D from this file, so the setting is in force.
export const D = Decimal.set({ precision: 40 });

// Built from the number's shortest text, so 0.1 is 0.1 and not its binary value.
export function decimalFromNumber(n: number): Decimal {
  return new D(String(n));
}

// Read on the same text: String(1e-7) is "1e-7", which has 7 decimals.
export function decimalPlaces(n: number): number {
  return decimalFromNumber(n).decimalPlaces();
}

// The one place a Decimal becomes a number: half-up to 2 decimals. A negative
// value that rounds to zero comes back as 0, not -0.
export function display(d: Decimal): number {
  const rounded = d.toDecimalPlaces(2, D.ROUND_HALF_UP).toNumber();
  return rounded === 0 ? 0 : rounded;
}
