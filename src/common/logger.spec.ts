import { createServer } from 'node:http';
import { Writable } from 'node:stream';
import pinoHttp, { Options } from 'pino-http';
import request from 'supertest';
import { loggerParams } from './logger';

// Collects every log line pino writes, so the test reads what would reach stdout.
function memoryStream() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
}

// A plain HTTP server running the request logger exactly as nestjs-pino would.
function loggedServer(stream: Writable) {
  const { pinoHttp: options } = loggerParams({ LOG_LEVEL: 'info' });
  const middleware = pinoHttp(options as Options, stream);
  return createServer((req, res) => {
    middleware(req, res);
    res.end('ok');
  });
}

// pino-http writes the summary line when the response finishes.
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

describe('loggerParams', () => {
  it('redacts authorization and cookie from a request line', async () => {
    const { lines, stream } = memoryStream();
    await request(loggedServer(stream))
      .post('/v1/probe')
      .set('Authorization', 'Bearer a-secret-admin-token-of-many-characters')
      .set('Cookie', 'session=a-secret-session')
      .send({ secret: 'a-secret-body' })
      .expect(200);
    await nextTurn();

    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line.req.headers.authorization).toBe('[Redacted]');
    expect(line.req.headers.cookie).toBe('[Redacted]');
    expect(lines[0]).not.toMatch(/a-secret/);
  });

  it('takes the request id from x-request-id and echoes it', async () => {
    const { lines, stream } = memoryStream();
    const response = await request(loggedServer(stream))
      .get('/v1/probe')
      .set('x-request-id', 'client-request-7')
      .expect(200);
    await nextTurn();

    expect(response.headers['x-request-id']).toBe('client-request-7');
    expect(JSON.parse(lines[0]).req.id).toBe('client-request-7');
  });

  it('generates a v7 request id when none is sent, and echoes it', async () => {
    const { lines, stream } = memoryStream();
    const response = await request(loggedServer(stream))
      .get('/v1/probe')
      .expect(200);
    await nextTurn();

    const id = response.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(JSON.parse(lines[0]).req.id).toBe(id);
  });

  it('logs nothing below the configured level', async () => {
    const { lines, stream } = memoryStream();
    const { pinoHttp: options } = loggerParams({ LOG_LEVEL: 'warn' });
    const middleware = pinoHttp(options as Options, stream);
    await request(
      createServer((req, res) => {
        middleware(req, res);
        res.end('ok');
      }),
    )
      .get('/v1/probe')
      .expect(200);
    await nextTurn();

    expect(lines).toEqual([]);
  });
});
