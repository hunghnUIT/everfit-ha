import { IncomingMessage, ServerResponse } from 'node:http';
import { Params } from 'nestjs-pino';
import { v7 } from 'uuid';
import { ApiEnv } from '../config/env';

type RequestWithId = IncomingMessage & { id?: unknown };

// The request id: the client's x-request-id, or a new v7, echoed on the
// response. The problem filter calls it too, because a body-parser error is
// answered before the request logger has run.
export function requestIdOf(req: RequestWithId, res: ServerResponse): string {
  if (typeof req.id === 'string') return req.id;
  const header = req.headers['x-request-id'];
  const id = typeof header === 'string' && header !== '' ? header : v7();
  req.id = id;
  res.setHeader('x-request-id', id);
  return id;
}

// JSON to stdout, one summary line per request. The default serializers log
// headers but no bodies; the two headers that carry credentials are redacted.
export function loggerParams(env: Pick<ApiEnv, 'LOG_LEVEL'>): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      genReqId: requestIdOf,
    },
  };
}
