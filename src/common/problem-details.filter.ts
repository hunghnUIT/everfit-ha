import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { get, kebabCase } from 'lodash';
import { BODY_LIMIT } from './limits';
import { requestIdOf } from './logger';
import { ApiProblem, driverErrorCode, ProblemCode } from './problem';

const TITLES: Record<ProblemCode, string> = {
  VALIDATION_ERROR: 'Request validation failed',
  MALFORMED_JSON: 'Malformed JSON',
  UNAUTHORIZED: 'Unauthorized',
  NOT_FOUND: 'Not found',
  EXERCISE_EXISTS: 'Exercise already exists',
  MUSCLE_GROUP_EXISTS: 'Muscle group already exists',
  MUSCLE_GROUP_IN_USE: 'Muscle group in use',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  INTERNAL_ERROR: 'Internal error',
  SERVICE_UNAVAILABLE: 'Service unavailable',
};

// The §9.6 code for each status an HttpException may carry.
const CODE_FOR_STATUS: Record<number, ProblemCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  503: 'SERVICE_UNAVAILABLE',
};

// The detail when nothing more specific is known.
const DETAILS: Record<ProblemCode, string> = {
  VALIDATION_ERROR: 'The request is invalid.',
  MALFORMED_JSON: 'The request body is not valid JSON.',
  UNAUTHORIZED: 'The request is not authorized.',
  NOT_FOUND: 'Nothing is found at this address.',
  EXERCISE_EXISTS: 'The exercise is already in the catalog.',
  MUSCLE_GROUP_EXISTS: 'The muscle group already exists.',
  MUSCLE_GROUP_IN_USE: 'An exercise still lists the muscle group.',
  PAYLOAD_TOO_LARGE: `The request body is over the ${BODY_LIMIT} limit.`,
  UNSUPPORTED_MEDIA_TYPE: 'Send Content-Type: application/json.',
  INTERNAL_ERROR:
    'An unexpected error occurred. Quote the requestId when reporting it.',
  SERVICE_UNAVAILABLE: 'The database is unreachable. Try again shortly.',
};

const problemOf = (status: number, code: ProblemCode) =>
  new ApiProblem(status, code, DETAILS[code]);

// ECONNREFUSED, SQLSTATE class 08 (connection exception), 57P01 (admin shutdown).
const isConnectionFailure = (code: string | undefined) =>
  code !== undefined &&
  (code === 'ECONNREFUSED' || code === '57P01' || /^08[0-9A-Z]{3}$/.test(code));

function fromHttpException(exception: HttpException): ApiProblem {
  const code = CODE_FOR_STATUS[exception.getStatus()];
  if (code === undefined) return problemOf(500, 'INTERNAL_ERROR');
  // A message given to the exception (the unknown route's "Cannot GET /x")
  // is shown; otherwise, as with terminus's health result, the default text.
  const message: unknown = get(exception.getResponse(), 'message');
  const detail = typeof message === 'string' ? message : DETAILS[code];
  return new ApiProblem(exception.getStatus(), code, detail);
}

// The filter's mapping as a pure function (design §9.6).
export function toApiProblem(exception: unknown): ApiProblem {
  if (exception instanceof ApiProblem) return exception;
  // body-parser's errors carry a type. Nest 12's Express adapter hands them
  // over wrapped in an HttpException whose cause is the original.
  const bodyParserType: unknown =
    get(exception, 'type') ?? get(exception, 'cause.type');
  if (bodyParserType === 'entity.parse.failed') {
    return problemOf(400, 'MALFORMED_JSON');
  }
  if (bodyParserType === 'entity.too.large') {
    return problemOf(413, 'PAYLOAD_TOO_LARGE');
  }
  if (isConnectionFailure(driverErrorCode(exception))) {
    return problemOf(503, 'SERVICE_UNAVAILABLE');
  }
  if (exception instanceof HttpException) return fromHttpException(exception);
  return problemOf(500, 'INTERNAL_ERROR');
}

// Every non-2xx answer passes here and leaves as application/problem+json.
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const problem = toApiProblem(exception);
    const requestId = requestIdOf(req, res);
    if (problem.status === 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }
    res
      .status(problem.status)
      .set(problem.headers ?? {})
      .type('application/problem+json')
      .json({
        type: `https://errors.workout-api.local/${kebabCase(problem.code)}`,
        title: TITLES[problem.code],
        status: problem.status,
        code: problem.code,
        detail: problem.detail,
        instance: req.originalUrl.split('?', 1)[0],
        requestId,
        ...(problem.errors && { errors: problem.errors }),
      });
  }
}
