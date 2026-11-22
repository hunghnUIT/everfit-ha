import type { NextFunction, Request, Response } from 'express';
import { ApiProblem } from './problem';

const BODY_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH']);

// Design §9.6: only JSON is parsed, and any other body is a 415, so that
// `curl -d` without a header is not answered with field errors for a body
// that looks right. req.is compares the media type alone (charset and other
// parameters are ignored) and answers null when the request has no body,
// which passes on to the body-shape check. Registered before the JSON
// parser; the problem goes to Express's next, and the global filter renders it.
export function requireJson(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (BODY_METHODS.has(req.method) && req.is('application/json') === false) {
    next(
      new ApiProblem(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Send Content-Type: application/json',
      ),
    );
    return;
  }
  next();
}
