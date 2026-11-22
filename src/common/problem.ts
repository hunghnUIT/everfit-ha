import get from 'lodash/get';

export type FieldError = { path: string; message: string };

export type Check<T> =
  { ok: true; value: T } | { ok: false; errors: FieldError[] };

// The codes of design §9.6.
export type ProblemCode =
  | 'VALIDATION_ERROR'
  | 'MALFORMED_JSON'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'EXERCISE_EXISTS'
  | 'MUSCLE_GROUP_EXISTS'
  | 'MUSCLE_GROUP_IN_USE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

// Thrown anywhere in the application; the filter turns it into the body.
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: ProblemCode,
    readonly detail: string,
    readonly errors?: FieldError[],
    readonly headers?: Record<string, string>,
  ) {
    super(detail);
    this.name = 'ApiProblem';
  }
}

export function validationProblem(errors: FieldError[]): ApiProblem {
  const detail =
    errors.length === 1
      ? '1 field is invalid.'
      : `${errors.length} fields are invalid.`;
  return new ApiProblem(400, 'VALIDATION_ERROR', detail, errors);
}

// The SQLSTATE or socket code of a database error. Drizzle wraps the driver's
// error, so the code is on the error or on its cause.
export function driverErrorCode(error: unknown): string | undefined {
  const code: unknown = get(error, 'code') ?? get(error, 'cause.code');
  return typeof code === 'string' ? code : undefined;
}

// The class name of a caught error, such as 'TypeError', for a log line that
// must not carry the message (a driver's message can name the host).
export function errorName(error: unknown): string | undefined {
  const name: unknown = get(error, 'name');
  return typeof name === 'string' ? name : undefined;
}
