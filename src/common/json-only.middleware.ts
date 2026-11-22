import type { NextFunction, Request, Response } from 'express';
import { ApiProblem } from './problem';

// The 415 detail, as design §9.6 words it; the filter uses it too.
export const JSON_ONLY_DETAIL = 'Send Content-Type: application/json';

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
  // No body, so nothing of the wrong type was sent. type-is treats a zero
  // length as a body, and Postman, supertest and Node clients send
  // Content-Length: 0 for an empty POST.
  const empty =
    req.headers['content-length'] === '0' &&
    req.headers['transfer-encoding'] === undefined;
  if (
    BODY_METHODS.has(req.method) &&
    !empty &&
    req.is('application/json') === false
  ) {
    next(new ApiProblem(415, 'UNSUPPORTED_MEDIA_TYPE', JSON_ONLY_DETAIL));
    return;
  }
  next();
}
