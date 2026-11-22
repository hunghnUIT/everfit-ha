import request from 'supertest';
import { createTestApp } from './support/app';

describe('units', () => {
  it('GET /v1/units lists kg and lb with their aliases', async () => {
    const app = await createTestApp();

    const res = await request(app.getHttpServer()).get('/v1/units').expect(200);

    expect(res.body).toEqual({
      data: [
        { code: 'kg', label: 'Kilogram', aliases: ['kgs'] },
        { code: 'lb', label: 'Pound', aliases: ['lbs'] },
      ],
    });
  });
});
