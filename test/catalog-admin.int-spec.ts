import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { createTestApp } from './support/app';
import { query } from './support/database';
import {
  entryBody,
  NOW,
  postEntry,
  PROBLEM_JSON,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

// An instant as the API prints it: UTC, with milliseconds.
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type EntryJson = { id: string; muscleGroups: string[] };

// The groups of muscle_groups as the 400 lists them: by code point.
async function groupsInTable(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    'SELECT name FROM muscle_groups ORDER BY name COLLATE "C"',
  );
  return rows.map((row) => row.name);
}

// The exercise admin routes (design §10.5, §10.6; §12, the Catalog row).
describe('catalog administration: exercises', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const create = (body: object) =>
    http().post('/v1/admin/exercises').send(body);

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  it('create → 201 + Location /v1/exercises/<encodeURIComponent(key)>; the same name again → 409 EXERCISE_EXISTS', async () => {
    // The display name is trimmed with inner spaces collapsed; the groups are
    // normalised and de-duplicated in the order sent.
    const res = withStatus(
      await create({
        name: '  Meadows   Row ',
        muscleGroups: ['Back ', 'biceps', 'BACK'],
      }),
      201,
    );
    expect(res.headers.location).toBe(
      `/v1/exercises/${encodeURIComponent('meadows row')}`,
    );
    expect(res.body.data).toEqual({
      key: 'meadows row',
      name: 'Meadows Row',
      muscleGroups: ['back', 'biceps'],
      createdAt: expect.stringMatching(ISO_MS),
      updatedAt: expect.stringMatching(ISO_MS),
    });
    // The public route reads the tables: the same exercise.
    const read = await http().get(res.headers.location).expect(200);
    expect(read.body.data).toEqual(res.body.data);

    const again = withStatus(
      await create({ name: 'meadows ROW', muscleGroups: ['back'] }),
      409,
    );
    expect(again.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(again.body.code).toBe('EXERCISE_EXISTS');
    expect(again.body.detail).toContain('"Meadows Row"');
  });

  it('two identical POSTs at once → one 201, one 409', async () => {
    const body = { name: 'Seal Row', muscleGroups: ['back', 'biceps'] };
    const [a, b] = await Promise.all([create(body), create(body)]);
    expect([a.status, b.status].toSorted((x, y) => x - y)).toEqual([201, 409]);

    const links = await query<{ muscle_group: string }>(
      `SELECT muscle_group FROM exercise_muscle_groups
        WHERE exercise_key = 'seal row' ORDER BY position`,
    );
    expect(links.map((l) => l.muscle_group)).toEqual(['back', 'biceps']);
  });

  it('an unknown group → 400 listing the groups read from the table', async () => {
    // Added by SQL and never loaded into this app's snapshot: the list in the
    // message must come from the table.
    await query("INSERT INTO muscle_groups (name) VALUES ('neck')");

    const res = withStatus(
      await create({ name: 'Neck Curl', muscleGroups: ['neck', 'cheast'] }),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([
      {
        path: 'muscleGroups[1]',
        message: `Unknown muscle group "cheast". Known muscle groups: ${(await groupsInTable()).join(', ')}.`,
      },
    ]);
    expect(res.body.errors[0].message).toContain('neck');
    const rows = await query(
      "SELECT 1 FROM exercises WHERE exercise_key = 'neck curl'",
    );
    expect(rows).toHaveLength(0);
  });

  it('PUT with a name whose key differs from the path → 400; PUT of an unknown key → 404', async () => {
    const renamed = withStatus(
      await http()
        .put('/v1/admin/exercises/deadlift')
        .send({ name: 'Romanian Deadlift', muscleGroups: ['hamstrings'] }),
      400,
    );
    expect(renamed.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(renamed.body.code).toBe('VALIDATION_ERROR');
    expect(renamed.body.errors).toEqual([
      { path: 'name', message: expect.stringContaining('"deadlift"') },
    ]);
    // Nothing changed.
    const deadlift = await http().get('/v1/exercises/deadlift').expect(200);
    expect(deadlift.body.data.name).toBe('Deadlift');

    const unknown = withStatus(
      await http()
        .put('/v1/admin/exercises/jefferson%20curl')
        .send({ name: 'Jefferson Curl', muscleGroups: ['hamstrings'] }),
      404,
    );
    expect(unknown.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(unknown.body.code).toBe('NOT_FOUND');
  });

  it('90/90 Hip Stretch: created, Location followed, then PUT and DELETE by that path', async () => {
    const created = withStatus(
      await create({ name: '90/90 Hip Stretch', muscleGroups: ['glutes'] }),
      201,
    );
    const location = created.headers.location;
    expect(location).toBe('/v1/exercises/90%2F90%20hip%20stretch');

    const read = await http().get(location).expect(200);
    expect(read.body.data).toMatchObject({
      key: '90/90 hip stretch',
      name: '90/90 Hip Stretch',
      muscleGroups: ['glutes'],
    });

    const adminPath = location.replace(
      '/v1/exercises/',
      '/v1/admin/exercises/',
    );
    const replaced = withStatus(
      await http()
        .put(adminPath)
        .send({
          name: '90/90 hip stretch',
          muscleGroups: ['hamstrings', 'glutes'],
        }),
      200,
    );
    expect(replaced.body.data).toMatchObject({
      key: '90/90 hip stretch',
      name: '90/90 hip stretch',
      muscleGroups: ['hamstrings', 'glutes'],
    });
    const reread = await http().get(location).expect(200);
    expect(reread.body.data).toEqual(replaced.body.data);

    await http().delete(adminPath).expect(204);
    await http().get(location).expect(404);
  });

  it('the key rule: log "  ZERCHER   squat ", create "Zercher Squat", the entry shows its groups', async () => {
    const userId = uniqueUserId();
    const logged = withStatus(
      await postEntry(
        app,
        userId,
        entryBody({ exerciseName: '  ZERCHER   squat ' }),
      ),
      201,
    );
    const entry = logged.body.data as EntryJson;
    expect(entry.muscleGroups).toEqual([]);

    withStatus(
      await create({
        name: 'Zercher Squat',
        muscleGroups: ['quads', 'glutes', 'back'],
      }),
      201,
    );
    const read = await http()
      .get(`/v1/users/${userId}/workout-entries/${entry.id}`)
      .expect(200);
    expect(read.body.data.muscleGroups).toEqual(['quads', 'glutes', 'back']);
  });

  it('delete an exercise → 204 with an empty body; its entries stay listed with PRs intact and muscleGroups [], the filter no longer matches; POST it again restores the mapping', async () => {
    const userId = uniqueUserId();
    const ids: string[] = [];
    for (const date of [
      '2025-02-08T06:00:00+07:00',
      '2025-02-10T06:00:00+07:00',
    ]) {
      const res = withStatus(
        await postEntry(app, userId, entryBody({ date })),
        201,
      );
      ids.push(res.body.data.id as string);
    }
    const history = (qs = '') =>
      http().get(`/v1/users/${userId}/workout-entries${qs}`).expect(200);
    const records = async () =>
      (
        await http()
          .get(`/v1/users/${userId}/personal-records?exercise=Bench%20Press`)
          .expect(200)
      ).body.data.records as unknown;
    const recordsBefore = await records();
    expect((await history('?muscleGroup=chest')).body.data).toHaveLength(2);

    const deleted = await http()
      .delete('/v1/admin/exercises/bench%20press')
      .expect(204);
    expect(deleted.text).toBe('');

    const after = (await history()).body.data as EntryJson[];
    expect(after.map((e) => e.id).toSorted()).toEqual(ids.toSorted());
    expect(after.map((e) => e.muscleGroups)).toEqual([[], []]);
    expect(await records()).toEqual(recordsBefore);
    expect((await history('?muscleGroup=chest')).body.data).toEqual([]);

    withStatus(
      await create({
        name: 'Bench Press',
        muscleGroups: ['chest', 'shoulders', 'triceps'],
      }),
      201,
    );
    const restored = (await history()).body.data as EntryJson[];
    expect(restored.map((e) => e.muscleGroups)).toEqual([
      ['chest', 'shoulders', 'triceps'],
      ['chest', 'shoulders', 'triceps'],
    ]);
    expect((await history('?muscleGroup=chest')).body.data).toHaveLength(2);
  });

  it("a group inserted by SQL after this app's last refresh is accepted at once by an exercise write", async () => {
    await query("INSERT INTO muscle_groups (name) VALUES ('rotator cuff')");

    const res = withStatus(
      await create({
        name: 'Cable External Rotation',
        muscleGroups: ['rotator cuff', 'shoulders'],
      }),
      201,
    );
    expect(res.body.data.muscleGroups).toEqual(['rotator cuff', 'shoulders']);
  });
});
