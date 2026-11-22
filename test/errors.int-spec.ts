import { INestApplication, Logger } from '@nestjs/common';
import get from 'lodash/get';
import request from 'supertest';
import { createTestApp } from './support/app';
import { ProbeController } from './support/probe.controller';

const PROBLEM_JSON = /^application\/problem\+json/;

type LogCall = { level: 'log' | 'warn' | 'error'; fields: unknown };

// The harness mutes logs (LOG_LEVEL=fatal), so the problem filter's log calls
// are recorded at its Nest Logger instead, and nothing is printed.
function recordFilterLogs(): LogCall[] {
  const calls: LogCall[] = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation(function (
      this: Logger,
      fields: unknown,
      ..._rest: unknown[]
    ) {
      if (get(this, 'context') === 'ProblemDetailsFilter') {
        calls.push({ level, fields });
      }
    });
  }
  return calls;
}

// One header helmet sets, and the one it removes.
function expectHelmet(res: request.Response) {
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['x-powered-by']).toBeUndefined();
}

describe('errors', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  let logs: LogCall[];

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  beforeEach(() => {
    logs = recordFilterLogs();
  });

  afterEach(() => jest.restoreAllMocks());

  it('unknown route → 404 application/problem+json, code NOT_FOUND, requestId', async () => {
    const res = await http().get('/v1/nothing-here').expect(404);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body).toMatchObject({
      type: 'https://errors.workout-api.local/not-found',
      status: 404,
      code: 'NOT_FOUND',
      instance: '/v1/nothing-here',
      requestId: expect.any(String),
    });
  });

  it('malformed JSON → 400 MALFORMED_JSON', async () => {
    const res = await http()
      .post('/v1/probe')
      .set('Content-Type', 'application/json')
      .send('{"n": 1,')
      .expect(400);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expectHelmet(res);
    expect(res.body).toMatchObject({
      code: 'MALFORMED_JSON',
      instance: '/v1/probe',
      requestId: expect.any(String),
    });
  });

  it('a 200 KB body is accepted', async () => {
    const body = { n: 1, note: 'x'.repeat(200_000) };
    const res = await http().post('/v1/probe').send(body).expect(200);
    expect(res.body).toEqual(body);
  });

  it('a body over 1 MB → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await http()
      .post('/v1/probe')
      .send({ n: 1, note: 'x'.repeat(1_100_000) })
      .expect(413);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expectHelmet(res);
    expect(res.body).toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      requestId: expect.any(String),
    });
  });

  it('{ "n": "x" } → 400 VALIDATION_ERROR with exactly one error, path "n"', async () => {
    const res = await http().post('/v1/probe').send({ n: 'x' }).expect(400);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body).toMatchObject({
      type: 'https://errors.workout-api.local/validation-error',
      title: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      detail: '1 field is invalid.',
      requestId: expect.any(String),
    });
    expect(res.body.errors).toEqual([
      { path: 'n', message: expect.any(String) },
    ]);
  });

  it('a validation error carries no part of the validated object (its target)', async () => {
    // The global pipe keeps each error's target for toFieldErrors; only the
    // path and message of an error may leave.
    const res = await http()
      .post('/v1/probe')
      .send({ n: 'x', note: 'target-marker' })
      .expect(400);
    expect(res.body.errors).toEqual([
      { path: 'n', message: expect.any(String) },
    ]);
    expect(res.text).not.toContain('target-marker');
    expect(JSON.stringify(logs)).not.toContain('target-marker');
  });

  it('an unknown body property → 400 VALIDATION_ERROR naming it', async () => {
    const res = await http()
      .post('/v1/probe')
      .send({ n: 1, extra: true })
      .expect(400);
    expect(res.body.errors).toEqual([
      { path: 'extra', message: expect.any(String) },
    ]);
  });

  it('an unexpected throw → 500 INTERNAL_ERROR with no stack in the body', async () => {
    const res = await http().get('/v1/probe/boom').expect(500);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'code',
        'detail',
        'instance',
        'requestId',
        'status',
        'title',
        'type',
      ].sort(),
    );
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toMatch(/secretColumn|TypeError|\.ts:\d+/);
    expect(logs).toEqual([
      {
        level: 'error',
        fields: expect.objectContaining({
          requestId: res.body.requestId,
          err: expect.any(TypeError),
        }),
      },
    ]);
  });

  it('a database that is down → 503, logged as one warn line with the code only', async () => {
    const res = await http().get('/v1/probe/db-down').expect(503);
    expect(res.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(logs).toEqual([
      {
        level: 'warn',
        fields: { code: 'ECONNREFUSED', requestId: res.body.requestId },
      },
    ]);
    const databaseUrl = process.env.DATABASE_URL ?? '';
    const written = JSON.stringify(logs);
    expect(written).not.toContain(databaseUrl);
    expect(written).not.toContain(`:${new URL(databaseUrl).password}@`);
  });

  it('logs a body-parser failure in one line, as the request logger never saw it', async () => {
    await http()
      .post('/v1/probe')
      .set('Content-Type', 'application/json')
      .set('x-request-id', 'client-request-44')
      .send('{')
      .expect(400);
    expect(logs).toEqual([
      {
        level: 'log',
        fields: {
          method: 'POST',
          path: '/v1/probe',
          status: 400,
          requestId: 'client-request-44',
        },
      },
    ]);
  });

  it('writes no such line for a request the request logger logs', async () => {
    await http().get('/v1/nothing-here').expect(404);
    expect(logs).toEqual([]);
  });

  it('echoes x-request-id and reports it as requestId', async () => {
    const res = await http()
      .get('/v1/nothing-here')
      .set('x-request-id', 'client-request-42')
      .expect(404);
    expect(res.headers['x-request-id']).toBe('client-request-42');
    expect(res.body.requestId).toBe('client-request-42');
  });

  it('a form-encoded body → 415 UNSUPPORTED_MEDIA_TYPE, detail "Send Content-Type: application/json"', async () => {
    // What curl -d sends without a -H (design §9.6).
    const res = await http()
      .post('/v1/probe')
      .type('form')
      .set('x-request-id', 'client-request-45')
      .send('n=1')
      .expect(415);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expectHelmet(res);
    expect(res.body).toMatchObject({
      type: 'https://errors.workout-api.local/unsupported-media-type',
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      detail: 'Send Content-Type: application/json',
      instance: '/v1/probe',
      requestId: 'client-request-45',
    });
    expect(logs).toEqual([
      {
        level: 'log',
        fields: {
          method: 'POST',
          path: '/v1/probe',
          status: 415,
          requestId: 'client-request-45',
        },
      },
    ]);
  });

  it('Content-Type application/json; charset=utf-8 → accepted', async () => {
    const res = await http()
      .post('/v1/probe')
      .set('Content-Type', 'application/json; charset=utf-8')
      .send('{"n":1}')
      .expect(200);
    expect(res.body).toEqual({ n: 1 });
  });

  // supertest, like Postman and Node clients, sends Content-Length: 0 for a
  // POST with no body; type-is would count that as a body.
  it('an empty POST with no Content-Type passes on to validation', async () => {
    const res = await http().post('/v1/probe').expect(400);
    expect(res.req.getHeader('content-type')).toBeUndefined();
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('an empty POST with a form Content-Type and Content-Length: 0 passes on to validation', async () => {
    const res = await http()
      .post('/v1/probe')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Content-Length', '0')
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('a body with no Content-Type header → 415', async () => {
    // A Buffer is sent as it is: superagent adds no Content-Type for it.
    const res = await http()
      .post('/v1/probe')
      .send(Buffer.from('{"n":1}'))
      .expect(415);
    expect(res.req.getHeader('content-type')).toBeUndefined();
    expect(res.body).toMatchObject({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      detail: 'Send Content-Type: application/json',
    });
  });

  it('a POST with the JSON header and no body passes on to validation', async () => {
    const res = await http()
      .post('/v1/probe')
      .set('Content-Type', 'application/json')
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('gives a body-parser failure the request id it echoes', async () => {
    const res = await http()
      .post('/v1/probe')
      .set('Content-Type', 'application/json')
      .set('x-request-id', 'client-request-43')
      .send('{')
      .expect(400);
    expect(res.headers['x-request-id']).toBe('client-request-43');
    expect(res.body.requestId).toBe('client-request-43');
  });
});
