import Decimal from 'decimal.js';

// A configured copy, so the library's global defaults stay as they are for
// any other code. 40 significant digits: the largest ranking product has 18
// (design §6).
export const D = Decimal.clone({ precision: 40 });

// Built from the number's shortest text, so 0.1 is 0.1 and not its binary value.
export function decimalFromNumber(n: number): Decimal {
  return new D(String(n));
}

// Read on the same text: String(1e-7) is "1e-7", which has 7 decimals.
export function decimalPlaces(n: number): number {
  return decimalFromNumber(n).decimalPlaces();
}

// The one place a Decimal becomes a number: half-up to 2 decimals.
export function display(d: Decimal): number {
  return d.toDecimalPlaces(2, D.ROUND_HALF_UP).toNumber();
}
