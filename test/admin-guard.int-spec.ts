import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PROBLEM_JSON, withStatus } from './support/fixtures';

// The guard switched on as the two lines of design §10.7 do it, on the real
// CatalogAdminController. Its own file: Jest gives each file its own module
// registry, so the decorator applied here never reaches another test.

// Set before this file loads any module of the app, which it does with
// await import() because static imports are hoisted above the assignment.
// setup-int.ts has loaded support/app, and AppModule with it, before this
// file runs, so the imports return those same modules: the decorator reaches
// the class AppModule registers. The guard reads the token through
// ConfigService, which falls back to process.env at request time for a
// variable that was unset when the environment was validated.
const TOKEN = 'admin-guard-test-token-0123456789abcdef';
process.env.ADMIN_API_TOKEN = TOKEN;

// Under "nodenext" the type checker resolves a literal import() as ESM, which
// wants a .js extension that Jest's resolver does not map. The specifier is
// passed as a value instead, and each type comes from a type-only import.
const load = <T>(specifier: string): Promise<T> => import(specifier);

describe('the admin guard applied to CatalogAdminController', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const bearer = `Bearer ${TOKEN}`;

  beforeAll(async () => {
    const { AdminOnly } = await load<
      typeof import('../src/common/admin-token.guard')
    >('../src/common/admin-token.guard');
    const { CatalogAdminController } = await load<
      typeof import('../src/exercises/catalog-admin.controller')
    >('../src/exercises/catalog-admin.controller');
    const { createTestApp } =
      await load<typeof import('./support/app')>('./support/app');
    AdminOnly()(CatalogAdminController);
    app = await createTestApp();
  });

  it('with AdminOnly applied to the real CatalogAdminController: each route 401 with WWW-Authenticate: Bearer without the token, success with it; GET /v1/exercises unaffected', async () => {
    const body = { name: 'Guarded Row', muscleGroups: ['back'] };
    const group = { name: 'Guarded Group' };
    const path = '/v1/admin/exercises/guarded%20row';
    const routes = [
      () => http().post('/v1/admin/exercises').send(body),
      () => http().put(path).send(body),
      () => http().delete(path),
      () => http().post('/v1/admin/muscle-groups').send(group),
      () => http().delete('/v1/admin/muscle-groups/guarded%20group'),
    ];
    for (const send of routes) {
      const res = withStatus(await send(), 401);
      expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(res.headers['www-authenticate']).toBe('Bearer');
      expect(res.body.code).toBe('UNAUTHORIZED');
    }
    const rows = await http().get('/v1/exercises/guarded%20row');
    expect(rows.status).toBe(404);

    withStatus(
      await http()
        .post('/v1/admin/exercises')
        .set('Authorization', bearer)
        .send(body),
      201,
    );
    withStatus(
      await http().put(path).set('Authorization', bearer).send(body),
      200,
    );
    withStatus(await http().delete(path).set('Authorization', bearer), 204);
    withStatus(
      await http()
        .post('/v1/admin/muscle-groups')
        .set('Authorization', bearer)
        .send(group),
      201,
    );
    withStatus(
      await http()
        .delete('/v1/admin/muscle-groups/guarded%20group')
        .set('Authorization', bearer),
      204,
    );

    await http().get('/v1/exercises').expect(200);
  });
});
