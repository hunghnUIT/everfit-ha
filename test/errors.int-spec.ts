import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/app';
import { ProbeController } from './support/probe.controller';

const PROBLEM_JSON = /^application\/problem\+json/;

describe('errors', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

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
  });

  it('echoes x-request-id and reports it as requestId', async () => {
    const res = await http()
      .get('/v1/nothing-here')
      .set('x-request-id', 'client-request-42')
      .expect(404);
    expect(res.headers['x-request-id']).toBe('client-request-42');
    expect(res.body.requestId).toBe('client-request-42');
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
