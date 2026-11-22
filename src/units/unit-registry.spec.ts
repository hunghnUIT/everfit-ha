import fc from 'fast-check';
import { D, decimalFromNumber } from '../common/decimal';
import { MAX_WEIGHT, WEIGHT_KG_INTEGER_DIGITS } from '../common/limits';
import { UnitRegistry } from './unit-registry';
import { WEIGHT_UNITS, WeightUnit } from './weight-units';

describe('UnitRegistry', () => {
  const reg = new UnitRegistry();

  it('converts 225 lb to exactly 102.05828325 kg', () =>
    expect(reg.toKg(decimalFromNumber(225), 'lb').toString()).toBe(
      '102.05828325',
    ));

  it.each([
    ['lbs', 'lb'],
    ['LB', 'lb'],
    ['Kg', 'kg'],
    ['kgs', 'kg'],
  ])('resolves %s to %s', (input, code) =>
    expect(reg.resolve(input)).toBe(code),
  );

  it('resolves " Lbs " to lb after trimming', () =>
    expect(reg.resolve(' Lbs ')).toBe('lb'));

  it('returns null for stone', () => expect(reg.resolve('stone')).toBeNull());

  it('round-trips a unit registered only in the test (X1)', () => {
    const withStone = new UnitRegistry([
      ...WEIGHT_UNITS,
      {
        code: 'st',
        label: 'Stone',
        kgPerUnit: '6.35029318',
        aliases: ['stone'],
      },
    ]);
    const code = withStone.resolve('stone');
    if (code === null) throw new Error('stone did not resolve');

    const kg = withStone.toKg(decimalFromNumber(10), code);

    expect(code).toBe('st');
    expect(kg.toString()).toBe('63.5029318');
    expect(withStone.fromKg(kg, code).toString()).toBe('10');
    expect(withStone.describe()).toBe('kg (kgs), lb (lbs), st (stone)');
  });

  // Design §6: a factor has at most 8 decimals, so a weight with 3 has at most
  // 11 in kilograms, which numeric(17,11) holds.
  const codesWithFinerFactor = (units: readonly WeightUnit[]) =>
    units
      .filter(({ kgPerUnit }) => new D(kgPerUnit).decimalPlaces() > 8)
      .map(({ code }) => code);

  it('has no factor with more than eight decimals', () =>
    expect(codesWithFinerFactor(WEIGHT_UNITS)).toEqual([]));

  it('flags a factor with twelve decimals (the exact ounce)', () =>
    expect(
      codesWithFinerFactor([
        ...WEIGHT_UNITS,
        {
          code: 'oz',
          label: 'Ounce',
          kgPerUnit: '0.028349523125',
          aliases: [],
        },
      ]),
    ).toEqual(['oz']));

  it.each(reg.codes())('fits MAX_WEIGHT in %s into numeric(17,11)', (code) => {
    const integerPart = reg.toKg(decimalFromNumber(MAX_WEIGHT), code);
    expect(integerPart.truncated().toFixed().length).toBeLessThanOrEqual(
      WEIGHT_KG_INTEGER_DIGITS,
    );
    // The finest accepted weight below the cap: 9999.999.
    const finest = reg.toKg(new D(MAX_WEIGHT).minus('0.001'), code);
    expect(finest.decimalPlaces()).toBeLessThanOrEqual(11);
  });

  it('converts 100.125 kg to exactly 100.125 kg', () =>
    expect(reg.toKg(decimalFromNumber(100.125), 'kg').toString()).toBe(
      '100.125',
    ));

  it.each([5, null, undefined, ['kg', 'lb'], {}])(
    'resolves the non-string %p to null without throwing',
    // A cast: this tests the run-time guard for raw JSON or a repeated query
    // parameter, which the declared type cannot describe.
    (input) => expect(reg.resolve(input as unknown as string)).toBeNull(),
  );

  it('lists the codes kg and lb', () =>
    expect(reg.codes()).toEqual(['kg', 'lb']));

  it('converts 102.05828325 kg back to exactly 225 lb', () =>
    expect(reg.fromKg(new D('102.05828325'), 'lb').toString()).toBe('225'));

  it('describes the units as "kg (kgs), lb (lbs)"', () =>
    expect(reg.describe()).toBe('kg (kgs), lb (lbs)'));

  it('lists each unit with its label and aliases', () =>
    expect(reg.list()).toEqual([
      { code: 'kg', label: 'Kilogram', aliases: ['kgs'] },
      { code: 'lb', label: 'Pound', aliases: ['lbs'] },
    ]));

  it('kg → unit → kg stays within display rounding for generated weights', () =>
    fc.assert(
      fc.property(
        // Thousandths of a kilogram: 0 to 10 000 with at most 3 decimals.
        fc.integer({ min: 0, max: MAX_WEIGHT * 1000 }),
        fc.constantFrom(...reg.codes()),
        (thousandths, code) => {
          const kg = new D(thousandths).div(1000);
          const back = reg.toKg(reg.fromKg(kg, code), code);
          // Within half a display step, and the 3 decimals sent come back.
          expect(back.minus(kg).abs().lte('0.005')).toBe(true);
          expect(back.toDecimalPlaces(3).toString()).toBe(kg.toString());
        },
      ),
    ));
});
