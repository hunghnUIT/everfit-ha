import { ValidationError } from 'class-validator';
import { FieldError } from './problem';

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
    const [message] = Object.values(error.constraints ?? {});
    const own = message === undefined ? [] : [{ path, message }];
    return [...own, ...toFieldErrors(error.children ?? [], path)];
  });
}
