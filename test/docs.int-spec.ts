import request from 'supertest';
import { createTestApp } from './support/app';

describe('docs', () => {
  it('GET /docs-json → 200 with an openapi version; GET /docs → 200 text/html', async () => {
    const server = (await createTestApp()).getHttpServer();

    const json = await request(server).get('/docs-json').expect(200);
    expect(json.body.openapi).toMatch(/^3\./);

    const html = await request(server).get('/docs').expect(200);
    expect(html.headers['content-type']).toMatch(/^text\/html/);
  });
});
