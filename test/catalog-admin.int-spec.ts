import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { CLOCK, fixedClock } from '../src/common/clock';
import { CATALOG_WRITE_LOCK } from '../src/database/locks';
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

  it('a catalog write waits for the catalog write lock, then completes with its normal status', async () => {
    // A second connection holds the lock the way a seed run does.
    const holder = new Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    let released = false;
    try {
      await holder.query('SELECT pg_advisory_lock($1)', [CATALOG_WRITE_LOCK]);
      let settled = false;
      const pending = create({
        name: 'Lock Probe Row',
        muscleGroups: ['back'],
      }).then((res) => {
        settled = true;
        return res;
      });

      // Bounded wait for the write to be queued on the lock; the poll is the
      // check, the pause only spaces the polls.
      let waiting = 0;
      for (let i = 0; i < 100 && waiting === 0; i++) {
        const rows = await query<{ n: string }>(
          `SELECT count(*) AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'
              AND pid <> $1`,
          [(await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid],
        );
        waiting = Number(rows[0].n);
        if (waiting === 0) await new Promise((r) => setTimeout(r, 50));
      }
      expect(waiting).toBe(1);
      expect(settled).toBe(false);
      expect(
        await query(
          "SELECT 1 FROM exercises WHERE exercise_key = 'lock probe row'",
        ),
      ).toHaveLength(0);

      await holder.query('SELECT pg_advisory_unlock($1)', [CATALOG_WRITE_LOCK]);
      released = true;
      const res = withStatus(await pending, 201);
      expect(res.body.data.key).toBe('lock probe row');
    } finally {
      if (!released) {
        await holder.query('SELECT pg_advisory_unlock_all()').catch(() => {});
      }
      await holder.end();
    }
  });
});

// The two muscle-group routes (design §10.5).
describe('catalog administration: muscle groups', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const createGroup = (name: unknown) =>
    http().post('/v1/admin/muscle-groups').send({ name });
  const deleteGroup = (name: string) =>
    http().delete(`/v1/admin/muscle-groups/${encodeURIComponent(name)}`);

  beforeAll(async () => {
    app = await createTestApp();
  });

  it('a new group → 201; again → 409 MUSCLE_GROUP_EXISTS', async () => {
    const res = withStatus(await createGroup('  Forearm   Flexors '), 201);
    expect(res.body.data).toEqual({
      name: 'forearm flexors',
      createdAt: expect.stringMatching(ISO_MS),
    });
    expect(await groupsInTable()).toContain('forearm flexors');

    const again = withStatus(await createGroup('FOREARM flexors'), 409);
    expect(again.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(again.body.code).toBe('MUSCLE_GROUP_EXISTS');

    // The name rule is the one of every other write: a 400 naming "name".
    const bad = withStatus(await createGroup('   '), 400);
    expect(bad.body.errors[0].path).toBe('name');
    const missing = withStatus(
      await http().post('/v1/admin/muscle-groups').send({}),
      400,
    );
    expect(missing.body.errors[0].path).toBe('name');
  });

  it('deleting a group in use → 409 MUSCLE_GROUP_IN_USE (the 23503 of NO ACTION), saying how many exercises list it; unknown → 404', async () => {
    withStatus(await createGroup('Grip'), 201);
    for (const name of ['Grip Test A', 'Grip Test B']) {
      withStatus(
        await http()
          .post('/v1/admin/exercises')
          .send({ name, muscleGroups: ['grip', 'back'] }),
        201,
      );
    }
    const res = withStatus(await deleteGroup('GRIP'), 409);
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('MUSCLE_GROUP_IN_USE');
    expect(res.body.detail).toContain('2 exercises');
    expect(await groupsInTable()).toContain('grip');

    const missing = withStatus(await deleteGroup('no such group'), 404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('deleting an unused group → 204 with an empty body', async () => {
    withStatus(await createGroup('Hip Flexors'), 201);
    const res = withStatus(await deleteGroup('hip flexors'), 204);
    expect(res.text).toBe('');
    expect(await groupsInTable()).not.toContain('hip flexors');
    // The exercise write now refuses it, as an unknown group.
    withStatus(
      await http()
        .post('/v1/admin/exercises')
        .send({ name: 'Hip Thing', muscleGroups: ['hip flexors'] }),
      400,
    );
  });

  it('a group created through a second app instance is accepted at once by an exercise write on the first', async () => {
    const second = await createTestApp();
    withStatus(
      await request(second.getHttpServer())
        .post('/v1/admin/muscle-groups')
        .send({ name: 'Peroneals' }),
      201,
    );
    // The first app's snapshot never saw it: the write reads the table.
    const res = withStatus(
      await http()
        .post('/v1/admin/exercises')
        .send({ name: 'Peroneal Raise', muscleGroups: ['peroneals'] }),
      201,
    );
    expect(res.body.data.muscleGroups).toEqual(['peroneals']);
  });
});
