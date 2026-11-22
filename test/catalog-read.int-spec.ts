import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogRows } from '../src/exercises/catalog-snapshot';
import { PgCatalogLoader } from '../src/exercises/catalog-loader';
import {
  EXERCISE_CATALOG,
  ExerciseCatalog,
} from '../src/exercises/exercise-catalog';
import { createTestApp } from './support/app';
import { query } from './support/database';

// An instant as the API prints it: UTC, with milliseconds.
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type ExerciseBody = {
  key: string;
  name: string;
  muscleGroups: string[];
  createdAt: string;
  updatedAt: string;
};

const catalogOf = (app: INestApplication) =>
  app.get<ExerciseCatalog>(EXERCISE_CATALOG);

// A group, then an exercise and its links, by plain SQL: what a hand-typed
// change or another replica's write looks like here. `groups` is in position
// order; the links are inserted last position first, so a read that forgets
// ORDER BY position, or sorts by name, shows them in the wrong order.
async function insertBySql(
  group: string,
  name: string,
  key: string,
  groups: string[],
): Promise<void> {
  await query('INSERT INTO muscle_groups (name) VALUES ($1)', [group]);
  await query('INSERT INTO exercises (exercise_key, name) VALUES ($1, $2)', [
    key,
    name,
  ]);
  for (const [position, muscleGroup] of [...groups.entries()].toReversed()) {
    await query(
      `INSERT INTO exercise_muscle_groups (exercise_key, muscle_group, position)
       VALUES ($1, $2, $3)`,
      [key, muscleGroup, position],
    );
  }
}

describe('catalog read routes', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  it('GET /v1/exercises lists bench press with chest, shoulders, triceps in that order, with createdAt and updatedAt, ordered by key', async () => {
    // Two different instants, so neither field can be printed from the other.
    await query(
      `UPDATE exercises SET created_at = $1, updated_at = $2
        WHERE exercise_key = 'bench press'`,
      ['2025-01-15T09:00:00.125+07:00', '2025-03-01T08:30:00.250Z'],
    );
    const res = await http().get('/v1/exercises').expect(200);
    const data = res.body.data as ExerciseBody[];

    const [{ count }] = await query<{ count: number }>(
      'SELECT count(*)::int AS count FROM exercises',
    );
    expect(data).toHaveLength(count);
    const keys = data.map((exercise) => exercise.key);
    expect(keys).toEqual(keys.toSorted());

    expect(data.find((exercise) => exercise.key === 'bench press')).toEqual({
      key: 'bench press',
      name: 'Bench Press',
      muscleGroups: ['chest', 'shoulders', 'triceps'],
      createdAt: '2025-01-15T02:00:00.125Z',
      updatedAt: '2025-03-01T08:30:00.250Z',
    });
    // A seeded exercise whose groups are not in alphabetical order.
    expect(data.find((exercise) => exercise.key === 'squat')).toMatchObject({
      muscleGroups: ['quads', 'glutes', 'hamstrings'],
    });
    expect(catalogOf(app).snapshot().muscleGroupsFor('squat')).toEqual([
      'quads',
      'glutes',
      'hamstrings',
    ]);
    for (const exercise of data) {
      expect(exercise.createdAt).toMatch(ISO_MS);
      expect(exercise.updatedAt).toMatch(ISO_MS);
    }
  });

  it('/v1/exercises/Bench%20Press and /v1/exercises/bench%20press are the same resource; unknown → 404', async () => {
    const mixed = await http().get('/v1/exercises/Bench%20Press').expect(200);
    const lower = await http().get('/v1/exercises/bench%20press').expect(200);
    const spaced = await http()
      .get('/v1/exercises/%20BENCH%20%20press%20')
      .expect(200);

    expect(mixed.body).toEqual(lower.body);
    expect(spaced.body).toEqual(lower.body);
    expect(lower.body).toEqual({
      data: {
        key: 'bench press',
        name: 'Bench Press',
        muscleGroups: ['chest', 'shoulders', 'triceps'],
        createdAt: expect.stringMatching(ISO_MS),
        updatedAt: expect.stringMatching(ISO_MS),
      },
    });

    const missing = await http()
      .get('/v1/exercises/zercher%20squat')
      .expect(404);
    expect(missing.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(missing.body).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      instance: '/v1/exercises/zercher%20squat',
      requestId: expect.any(String),
    });
  });

  it('GET /v1/muscle-groups returns { name, exerciseCount }, ordered by name', async () => {
    const res = await http().get('/v1/muscle-groups').expect(200);
    const data = res.body.data as { name: string; exerciseCount: number }[];

    const names = data.map((group) => group.name);
    expect(names).toEqual(names.toSorted());
    expect(names).toEqual(
      expect.arrayContaining(['abs', 'back', 'chest', 'triceps']),
    );
    const [{ count }] = await query<{ count: number }>(
      'SELECT count(*)::int AS count FROM muscle_groups',
    );
    expect(data).toHaveLength(count);

    const [chest] = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM exercise_muscle_groups
        WHERE muscle_group = 'chest'`,
    );
    expect(data.find((group) => group.name === 'chest')).toEqual({
      name: 'chest',
      exerciseCount: chest.count,
    });
    expect(chest.count).toBeGreaterThan(0);
  });

  it('an exercise and a group inserted by SQL appear on both list routes without a refresh()', async () => {
    await insertBySql('neck', 'Neck Curl', 'neck curl', ['traps', 'neck']);
    await query('INSERT INTO muscle_groups (name) VALUES ($1)', ['adductors']);

    const exercises = await http().get('/v1/exercises').expect(200);
    expect(
      (exercises.body.data as ExerciseBody[]).find(
        (exercise) => exercise.key === 'neck curl',
      ),
    ).toMatchObject({ name: 'Neck Curl', muscleGroups: ['traps', 'neck'] });
    const one = await http().get('/v1/exercises/Neck%20Curl').expect(200);
    expect(one.body.data.muscleGroups).toEqual(['traps', 'neck']);

    const groups = await http().get('/v1/muscle-groups').expect(200);
    expect(groups.body.data).toEqual(
      expect.arrayContaining([
        { name: 'neck', exerciseCount: 1 },
        { name: 'adductors', exerciseCount: 0 },
      ]),
    );

    // The routes read the tables; the snapshot has not been refreshed.
    const snapshot = catalogOf(app).snapshot();
    expect(snapshot.hasMuscleGroup('neck')).toBe(false);
    expect(snapshot.muscleGroupsFor('neck curl')).toEqual([]);
  });

  it('after refresh() the snapshot holds an exercise inserted by SQL, its groups in position order', async () => {
    await insertBySql('serratus', 'Serratus Punch', 'serratus punch', [
      'shoulders',
      'serratus',
    ]);
    expect(catalogOf(app).snapshot().hasMuscleGroup('serratus')).toBe(false);

    await catalogOf(app).refresh();

    const snapshot = catalogOf(app).snapshot();
    expect(snapshot.hasMuscleGroup('serratus')).toBe(true);
    expect(snapshot.muscleGroupsFor('serratus punch')).toEqual([
      'shoulders',
      'serratus',
    ]);
  });

  it('init resolves only after the first load (U-19)', async () => {
    let finished = false;
    const slowLoader = {
      load: () =>
        new Promise<CatalogRows>((resolve) =>
          setTimeout(() => {
            finished = true;
            resolve({
              exercises: [
                {
                  key: 'slow squat',
                  name: 'Slow Squat',
                  muscleGroups: ['quads'],
                },
              ],
              groups: ['quads'],
            });
          }, 500),
        ),
    };

    const slowApp = await createTestApp({
      providers: [{ provide: PgCatalogLoader, useValue: slowLoader }],
    });

    expect(finished).toBe(true);
    expect(catalogOf(slowApp).snapshot().muscleGroupsFor('slow squat')).toEqual(
      ['quads'],
    );
  });

  it('a second catalog instance sees a group inserted by SQL after refresh()', async () => {
    const first = catalogOf(app);
    const secondApp = await createTestApp();
    const second = catalogOf(secondApp);

    await insertBySql(
      'rotator cuff',
      'Band External Rotation',
      'band external rotation',
      ['shoulders', 'rotator cuff'],
    );
    // A group no exercise uses is still a known group.
    await query('INSERT INTO muscle_groups (name) VALUES ($1)', [
      'hip flexors',
    ]);
    expect(second.snapshot().hasMuscleGroup('rotator cuff')).toBe(false);

    await second.refresh();

    expect(second.snapshot().hasMuscleGroup('rotator cuff')).toBe(true);
    expect(second.snapshot().keysForMuscleGroup('rotator cuff')).toEqual([
      'band external rotation',
    ]);
    expect(second.snapshot().muscleGroupsFor('band external rotation')).toEqual(
      ['shoulders', 'rotator cuff'],
    );
    expect(second.snapshot().hasMuscleGroup('hip flexors')).toBe(true);
    expect(second.snapshot().keysForMuscleGroup('hip flexors')).toEqual([]);
    expect(second.snapshot().muscleGroupsFor('bench press')).toEqual([
      'chest',
      'shoulders',
      'triceps',
    ]);
    // The first instance keeps its snapshot until its own refresh.
    expect(first.snapshot().hasMuscleGroup('rotator cuff')).toBe(false);
  });
});
