import request from 'supertest';
import { createTestApp } from './support/app';

// The OpenAPI document must describe every route of design §9: its path, its
// path and query parameters, and what a success looks like. unit is a free
// string on input and an enum on output (§6); every example is a full
// date-time with an offset (§8).

type Json = Record<string, any>; // eslint-disable-line -- OpenAPI JSON, read-only in this file

const COMMON_QUERY = ['exercise', 'from', 'to', 'unit'];

// [method, path, path parameters, query parameters, success status]
const ROUTES: [string, string, string[], string[], string][] = [
  ['post', '/v1/users/{userId}/workout-entries', ['userId'], [], '201'],
  ['post', '/v1/users/{userId}/workout-entries/bulk', ['userId'], [], '201'],
  [
    'get',
    '/v1/users/{userId}/workout-entries',
    ['userId'],
    ['exercise', 'muscleGroup', 'from', 'to', 'unit', 'limit', 'cursor'],
    '200',
  ],
  [
    'get',
    '/v1/users/{userId}/workout-entries/{id}',
    ['userId', 'id'],
    ['unit'],
    '200',
  ],
  [
    'get',
    '/v1/users/{userId}/personal-records',
    ['userId'],
    COMMON_QUERY,
    '200',
  ],
  [
    'get',
    '/v1/users/{userId}/personal-records/compare',
    ['userId'],
    ['exercise', 'from', 'to', 'compareFrom', 'compareTo', 'unit'],
    '200',
  ],
  ['get', '/v1/exercises', [], [], '200'],
  ['get', '/v1/exercises/{exerciseKey}', ['exerciseKey'], [], '200'],
  ['get', '/v1/muscle-groups', [], [], '200'],
  ['get', '/v1/units', [], [], '200'],
  ['post', '/v1/admin/exercises', [], [], '201'],
  ['put', '/v1/admin/exercises/{exerciseKey}', ['exerciseKey'], [], '200'],
  ['delete', '/v1/admin/exercises/{exerciseKey}', ['exerciseKey'], [], '204'],
  ['post', '/v1/admin/muscle-groups', [], [], '201'],
  ['delete', '/v1/admin/muscle-groups/{name}', ['name'], [], '204'],
  ['get', '/health/live', [], [], '200'],
  ['get', '/health/ready', [], [], '200'],
];

// A JSON Schema reference, followed once.
function deref(doc: Json, node: Json): Json {
  const ref: unknown = node?.$ref;
  if (typeof ref !== 'string') return node;
  return ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<Json>((at, part) => at[part], doc);
}

// Every value under a key called "example", and every item of an "examples"
// array, anywhere in the document.
function collectExamples(node: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    node.forEach((item) => collectExamples(item, found));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'example') found.push(value);
      else if (key === 'examples' && Array.isArray(value)) found.push(...value);
      else collectExamples(value, found);
    }
  }
  return found;
}

function strings(node: unknown, found: string[] = []): string[] {
  if (typeof node === 'string') found.push(node);
  else if (Array.isArray(node)) node.forEach((item) => strings(item, found));
  else if (node !== null && typeof node === 'object') {
    Object.values(node).forEach((item) => strings(item, found));
  }
  return found;
}

describe('docs', () => {
  let doc: Json;
  let server: ReturnType<
    Awaited<ReturnType<typeof createTestApp>>['getHttpServer']
  >;

  beforeAll(async () => {
    server = (await createTestApp()).getHttpServer();
    doc = (await request(server).get('/docs-json').expect(200)).body;
  });

  it('GET /docs-json → 200 with an openapi version; GET /docs → 200 text/html', async () => {
    expect(doc.openapi).toMatch(/^3\./);
    const html = await request(server).get('/docs').expect(200);
    expect(html.headers['content-type']).toMatch(/^text\/html/);
  });

  it.each(ROUTES)(
    '%s %s lists its parameters and a described success',
    (method, path, pathParams, queryParams, status) => {
      const operation: Json | undefined = doc.paths[path]?.[method];
      expect(operation).toBeDefined();
      const params: Json[] = operation!.parameters ?? [];
      const named = (where: string) =>
        params
          .filter((p) => p.in === where)
          .map((p) => p.name as string)
          .sort();
      expect(named('path')).toEqual([...pathParams].sort());
      expect(named('query')).toEqual([...queryParams].sort());
      const success: Json | undefined = operation!.responses[status];
      expect(success).toBeDefined();
      expect(success!.description).toBeTruthy();
      // A 204 has no body; every other success shows its schema.
      if (status !== '204') {
        expect(success!.content?.['application/json']?.schema).toBeDefined();
      }
    },
  );

  it('documents no route beyond design §9 and the docs themselves', () => {
    const documented = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops as Json).map((method) => `${method} ${path}`),
    );
    expect(documented.sort()).toEqual(
      ROUTES.map(([method, path]) => `${method} ${path}`).sort(),
    );
  });

  it('every route names its problem responses, as problem+json', () => {
    const problem = (path: string, method: string, status: string) =>
      doc.paths[path][method].responses[status]?.content?.[
        'application/problem+json'
      ]?.schema;
    expect(
      problem('/v1/users/{userId}/workout-entries', 'post', '400'),
    ).toBeDefined();
    expect(
      problem('/v1/users/{userId}/workout-entries/{id}', 'get', '404'),
    ).toBeDefined();
    expect(problem('/v1/admin/exercises', 'post', '409')).toBeDefined();
    expect(
      problem('/v1/admin/muscle-groups/{name}', 'delete', '409'),
    ).toBeDefined();
    const schema = deref(
      doc,
      problem('/v1/users/{userId}/workout-entries', 'post', '400'),
    );
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['code', 'requestId', 'errors']),
    );
  });

  it('unit is a free string on input and an enum on output (§6)', () => {
    const schemas: Json = doc.components.schemas;
    expect(schemas.SetInputDto.properties.unit.type).toBe('string');
    expect(schemas.SetInputDto.properties.unit.enum).toBeUndefined();
    expect(schemas.SetInputDto.properties.unit.description).toMatch(/lbs/);

    const outputs = ['SetResponseDto', 'OriginalWeightDto'];
    for (const name of outputs) {
      expect(schemas[name].properties.unit.enum).toEqual(['kg', 'lb']);
    }
    // The records' set fields, and a catalog-free unit list, use codes too.
    expect(schemas.RecordSetDto.properties.unit.enum).toEqual(['kg', 'lb']);
    expect(schemas.UnitDto.properties.code.enum).toEqual(['kg', 'lb']);
  });

  it('query unit parameters are free strings that list the spellings', () => {
    for (const path of [
      '/v1/users/{userId}/workout-entries',
      '/v1/users/{userId}/workout-entries/{id}',
      '/v1/users/{userId}/personal-records',
      '/v1/users/{userId}/personal-records/compare',
    ]) {
      const unit = (doc.paths[path].get.parameters as Json[]).find(
        (p) => p.name === 'unit',
      )!;
      expect(unit.schema.type).toBe('string');
      expect(unit.schema.enum).toBeUndefined();
      expect(unit.description).toMatch(/lbs/);
    }
  });

  it('describes the instants as instants and the offset as display only', () => {
    const schemas: Json = doc.components.schemas;
    expect(schemas.EntryResponseDto.properties.date.description).toMatch(
      /first ten characters are not a local date/,
    );
    expect(schemas.EntryResponseDto.properties.utcOffset.description).toMatch(
      /for display only/,
    );
    expect(schemas.RecordSetDto.properties.date.description).toMatch(
      /first ten characters are not a local date/,
    );
    expect(schemas.RecordSetDto.properties.utcOffset.description).toMatch(
      /for display only/,
    );
  });

  it('every admin operation and the tag say the routes are open', () => {
    const admin = Object.entries<Json>(doc.paths).filter(([path]) =>
      path.startsWith('/v1/admin/'),
    );
    const operations = admin.flatMap(([, ops]) => Object.values<Json>(ops));
    expect(operations).toHaveLength(5);
    for (const [, ops] of admin) {
      for (const operation of Object.values<Json>(ops)) {
        expect(operation.tags).toEqual(['Admin — catalog (UNAUTHENTICATED)']);
        expect(operation.description).toMatch(/UNAUTHENTICATED/);
        expect(operation.description).toMatch(/Catalog administration/);
      }
    }
  });

  it('every example date is a full date-time with an offset (§8)', () => {
    const examples = collectExamples(doc);
    const dates = strings(examples).filter((text) =>
      /^\d{4}-\d\d-\d\d/.test(text),
    );
    expect(dates.length).toBeGreaterThanOrEqual(10);
    for (const date of dates) {
      expect(date).toMatch(
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/,
      );
    }
  });
});
