import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiProblem, driverErrorCode } from './problem';
import { toApiProblem } from './problem-details.filter';

// What pg rejects with: an Error carrying a SQLSTATE or a socket error code.
const pgError = (code: string) =>
  Object.assign(new Error('connection failure'), { code });

// What body-parser passes to next(): an http-errors Error with a type.
const bodyParserError = (status: number, type: string) =>
  Object.assign(new Error('body-parser failure'), { status, type });

describe('driverErrorCode', () => {
  it('reads the code of the error itself', () =>
    expect(driverErrorCode(pgError('23503'))).toBe('23503'));

  it('reads the code of the cause when the error is wrapped', () =>
    expect(
      driverErrorCode(new Error('Failed query', { cause: pgError('23503') })),
    ).toBe('23503'));

  it.each([undefined, null, 'text', new Error('plain'), { code: 23503 }])(
    'gives undefined for %p',
    (value) => expect(driverErrorCode(value)).toBeUndefined(),
  );
});

describe('toApiProblem', () => {
  it('keeps an ApiProblem as it is', () => {
    const problem = new ApiProblem(409, 'EXERCISE_EXISTS', 'Already there.');
    expect(toApiProblem(problem)).toBe(problem);
  });

  it.each(['ECONNREFUSED', '08006', '57P01'])(
    'a pg failure with code %s → 503 SERVICE_UNAVAILABLE',
    (code) =>
      expect(toApiProblem(pgError(code))).toMatchObject({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
      }),
  );

  it('the same failure wrapped as Drizzle wraps it, with the pg error as cause → 503', () =>
    // Built by hand: drizzle-orm is not installed yet. Task 17b checks the
    // property against the real DrizzleQueryError (U-29).
    expect(
      toApiProblem(
        new Error('Failed query: select 1', { cause: pgError('08006') }),
      ),
    ).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' }));

  it('a pg error that is not a connection failure → 500 INTERNAL_ERROR', () =>
    expect(toApiProblem(pgError('23505'))).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    }));

  it('a ServiceUnavailableException (as terminus throws) → 503 SERVICE_UNAVAILABLE', () =>
    expect(
      toApiProblem(
        new ServiceUnavailableException({ status: 'error', details: {} }),
      ),
    ).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' }));

  it('an UnauthorizedException → 401 UNAUTHORIZED; a NotFoundException → 404 NOT_FOUND', () => {
    expect(toApiProblem(new UnauthorizedException())).toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(
      toApiProblem(new NotFoundException('Cannot GET /v1/nothing')),
    ).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      detail: 'Cannot GET /v1/nothing',
    });
  });

  it('a BadRequestException → 400 VALIDATION_ERROR', () =>
    expect(toApiProblem(new BadRequestException('Bad id'))).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    }));

  it('an HttpException with a status §9.6 has no code for → 500 INTERNAL_ERROR', () =>
    expect(toApiProblem(new HttpException('Teapot', 418))).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    }));

  it('entity.parse.failed → 400 MALFORMED_JSON; entity.too.large → 413 PAYLOAD_TOO_LARGE', () => {
    expect(
      toApiProblem(bodyParserError(400, 'entity.parse.failed')),
    ).toMatchObject({ status: 400, code: 'MALFORMED_JSON' });
    expect(
      toApiProblem(bodyParserError(413, 'entity.too.large')),
    ).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('the same body-parser errors as Nest 12 hands them over, wrapped in an HttpException → 400 / 413', () => {
    // Nest's Express adapter wraps an http-error in an HttpException whose
    // cause is the original (ExpressAdapter.mapException).
    const parseFailed = bodyParserError(400, 'entity.parse.failed');
    expect(
      toApiProblem(
        new BadRequestException(parseFailed.message, { cause: parseFailed }),
      ),
    ).toMatchObject({ status: 400, code: 'MALFORMED_JSON' });
    const tooLarge = bodyParserError(413, 'entity.too.large');
    expect(
      toApiProblem(
        new HttpException(tooLarge.message, 413, { cause: tooLarge }),
      ),
    ).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('a TypeError → 500 INTERNAL_ERROR whose detail names nothing internal', () => {
    const problem = toApiProblem(
      new TypeError("Cannot read properties of undefined (reading 'weightKg')"),
    );
    expect(problem).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    expect(problem.detail).not.toMatch(/weightKg|TypeError|undefined/);
    expect(problem.errors).toBeUndefined();
  });
});
