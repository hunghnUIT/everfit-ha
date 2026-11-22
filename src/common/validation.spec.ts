import { ValidationError } from 'class-validator';
import { toFieldErrors } from './validation';

// Builds a ValidationError the way class-validator nests them.
function node(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return Object.assign(new ValidationError(), {
    property,
    constraints,
    children,
  });
}

describe('toFieldErrors', () => {
  it('builds the path entries[2].sets[0].unit from nested ValidationErrors', () =>
    expect(
      toFieldErrors([
        node('entries', undefined, [
          node('2', undefined, [
            node('sets', undefined, [
              node('0', undefined, [
                node('unit', { isIn: 'unit must be kg or lb' }),
              ]),
            ]),
          ]),
        ]),
      ]),
    ).toEqual([
      { path: 'entries[2].sets[0].unit', message: 'unit must be kg or lb' },
    ]));

  it('gives one entry per path when a property fails two constraints', () =>
    expect(
      toFieldErrors([
        node('n', {
          isInt: 'n must be an integer number',
          min: 'n must not be less than 1',
        }),
      ]),
    ).toEqual([{ path: 'n', message: 'n must be an integer number' }]));

  it('keeps one entry for each failing path, in order', () =>
    expect(
      toFieldErrors([
        node('date', { isDefined: 'date should not be null or undefined' }),
        node('sets', undefined, [
          node('1', undefined, [
            node('reps', { isInt: 'reps must be an integer' }),
          ]),
        ]),
      ]),
    ).toEqual([
      { path: 'date', message: 'date should not be null or undefined' },
      { path: 'sets[1].reps', message: 'reps must be an integer' },
    ]));

  it('puts a prefix in front of every path', () =>
    expect(
      toFieldErrors([node('unit', { isIn: 'bad unit' })], 'sets[0]'),
    ).toEqual([{ path: 'sets[0].unit', message: 'bad unit' }]));
});
