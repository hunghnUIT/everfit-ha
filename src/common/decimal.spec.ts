import Decimal from 'decimal.js';
import { D, decimalFromNumber, decimalPlaces, display } from './decimal';

describe('decimal', () => {
  it('displays 100.125 as 100.13 (half-up)', () =>
    expect(display(new D('100.125'))).toBe(100.13));

  it('displays 102.05828325 as 102.06', () =>
    expect(display(new D('102.05828325'))).toBe(102.06));

  it.each([
    [100.125, 3],
    [10.1234, 4],
    [1e-7, 7],
    [225, 0],
  ])('decimalPlaces(%p) is %i', (n, places) =>
    expect(decimalPlaces(n)).toBe(places),
  );

  it('builds 0.1 from its shortest text, not its binary value', () =>
    expect(decimalFromNumber(0.1).toString()).toBe('0.1'));

  it('uses decimal precision 40', () => expect(D.precision).toBe(40));

  it("computes at 40 digits with the library's own constructor too", () =>
    expect(new Decimal(1).div(3).toString()).toBe(
      '0.3333333333333333333333333333333333333333',
    ));
});
