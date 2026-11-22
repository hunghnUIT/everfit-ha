import {
  getMetadataStorage,
  ValidationError,
  ValidatorOptions,
} from 'class-validator';
import { FieldError } from './problem';
import { QueryDto } from './query-dto';

// The rules every DTO is checked with, bodies and queries alike (design §9.1):
// an unknown property is refused, and one message per property.
export const VALIDATOR_OPTIONS = {
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: true,
} as const satisfies ValidatorOptions;

// class-validator's name for the forbidNonWhitelisted constraint.
const UNKNOWN_PROPERTY = 'whitelistValidation';

// The properties a DTO class declares, read from class-validator's own
// metadata, so the list follows the decorators.
function acceptedProperties(dto: object): string[] {
  const storage = getMetadataStorage();
  const metadata = storage.getTargetValidationMetadatas(
    dto.constructor,
    '',
    true,
    false,
  );
  return Object.keys(storage.groupByPropertyName(metadata));
}

// Design §9: a query parameter the route does not accept is named with the
// accepted ones, and one sent twice (it arrives as an array) is said so.
function queryMessage(error: ValidationError): string | undefined {
  if (!(error.target instanceof QueryDto)) return undefined;
  if (error.constraints?.[UNKNOWN_PROPERTY] !== undefined) {
    return (
      `Unknown query parameter '${error.property}'. Accepted parameters: ` +
      `${acceptedProperties(error.target).join(', ')}.`
    );
  }
  if (Array.isArray(error.value)) {
    return `'${error.property}' was sent more than once; send it once.`;
  }
  return undefined;
}

// class-validator nests errors by property and has no path formatter, so the
// tree is walked here: an array index becomes [i], a property becomes .name.
// A property that fails several constraints gives one entry, the first.
export function toFieldErrors(
  errors: ValidationError[],
  prefix = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const path = /^\d+$/.test(error.property)
      ? `${prefix}[${error.property}]`
      : prefix
        ? `${prefix}.${error.property}`
        : error.property;
    const [first] = Object.values(error.constraints ?? {});
    const message =
      first === undefined ? undefined : (queryMessage(error) ?? first);
    const own = message === undefined ? [] : [{ path, message }];
    return [...own, ...toFieldErrors(error.children ?? [], path)];
  });
}
