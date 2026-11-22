import { ValidationOptions, ValidateBy } from 'class-validator';
import { SHARED_UNIT_REGISTRY } from './unit-registry';

// The unknown-unit message of design §9.6, shared with readEntryInputs.
export function unsupportedUnitMessage(
  value: unknown,
  describe: string,
): string {
  // A query or JSON value is a string, an array or a plain object; JSON
  // shows the last two as sent, where String() would print [object Object].
  const shown = typeof value === 'string' ? value : JSON.stringify(value);
  return `Unsupported unit '${shown}'. Supported units: ${describe}.`;
}

// A unit code or alias known to the shared UnitRegistry, case-insensitive
// (design §6). resolve() answers null for a non-string, so any value is safe.
export function IsSupportedUnit(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isSupportedUnit',
      validator: {
        validate: (value: unknown) =>
          SHARED_UNIT_REGISTRY.resolve(value as string) !== null,
        defaultMessage: (args) =>
          unsupportedUnitMessage(args?.value, SHARED_UNIT_REGISTRY.describe()),
      },
    },
    validationOptions,
  );
}
