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
  rowsFor,
  uniqueUserId,
  withStatus,
} from './support/fixtures';

// An instant as the API prints it: UTC, with milliseconds.
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// A set with this reps value is the one a test trigger acts on.
const MARKER_REPS = 777;
const markedSets = { sets: [{ reps: MARKER_REPS, weight: 100, unit: 'kg' }] };

// Runs `run` while a BEFORE INSERT trigger on workout_sets executes `body`
// (PL/pgSQL) for each row; the trigger is dropped afterwards in any case.
async function withSetTrigger(
  body: string,
  run: () => Promise<void>,
): Promise<void> {
  await query(`CREATE FUNCTION test_set_trigger() RETURNS trigger
                 LANGUAGE plpgsql AS $$ BEGIN ${body} RETURN NEW; END $$`);
  await query(`CREATE TRIGGER test_set_trigger BEFORE INSERT ON workout_sets
                 FOR EACH ROW EXECUTE FUNCTION test_set_trigger()`);
  try {
    await run();
  } finally {
    await query('DROP TRIGGER IF EXISTS test_set_trigger ON workout_sets');
    await query('DROP FUNCTION IF EXISTS test_set_trigger()');
  }
}

// The pid of the backend running a statement that matches `pattern`, polled
// for up to five seconds while the request reaches the database.
async function backendRunning(pattern: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const [row] = await query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity
        WHERE state = 'active' AND query ILIKE $1 AND pid <> pg_backend_pid()`,
      [pattern],
    );
    if (row !== undefined) return row.pid;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`No backend is running ${pattern}`);
}

describe('log one entry (design §9.1)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      providers: [{ provide: CLOCK, useValue: fixedClock(NOW) }],
    });
  });

  it('the §9.1 request → 201 with the §9.1 body (ids and createdAt aside), and Location returns the same entry', async () => {
    const userId = uniqueUserId();
    const res = withStatus(await postEntry(app, userId), 201);
    expect(res.body).toEqual({
      data: {
        id: expect.stringMatching(UUID_V7),
        userId,
        exerciseName: 'Bench Press',
        exerciseKey: 'bench press',
        muscleGroups: ['chest', 'shoulders', 'triceps'],
        date: '2025-02-09T22:30:00.000Z',
        utcOffset: '+07:00',
        sets: [
          {
            setNumber: 1,
            reps: 5,
            weight: 102.06,
            unit: 'kg',
            original: { weight: 225, unit: 'lb' },
          },
          {
            setNumber: 2,
            reps: 3,
            weight: 105,
            unit: 'kg',
            original: { weight: 105, unit: 'kg' },
          },
        ],
        createdAt: expect.stringMatching(ISO_MS),
      },
    });
    const { id } = res.body.data;
    expect(res.headers.location).toBe(
      `/v1/users/${userId}/workout-entries/${id}`,
    );
    const read = await http().get(res.headers.location).expect(200);
    expect(read.body).toEqual(res.body);
    // createdAt is the row's created_at, to the millisecond.
    const [row] = await query<{ created_at: string }>(
      `SELECT to_char(created_at AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM workout_entries WHERE id = $1`,
      [id],
    );
    expect(res.body.data.createdAt).toBe(row.created_at);
    // Stored exactly, never rounded on write (§6), in request order.
    expect(
      await query(
        `SELECT set_number, reps, weight::text, unit, weight_kg::text
           FROM workout_sets WHERE entry_id = $1 ORDER BY set_number`,
        [id],
      ),
    ).toEqual([
      {
        set_number: 1,
        reps: 5,
        weight: '225.000',
        unit: 'lb',
        weight_kg: '102.05828325000',
      },
      {
        set_number: 2,
        reps: 3,
        weight: '105.000',
        unit: 'kg',
        weight_kg: '105.00000000000',
      },
    ]);
  });

  it('GET …/{id}?unit=lb shows the sets in lb; ?units=lb → 400 naming units and listing unit', async () => {
    const userId = uniqueUserId();
    const { id } = withStatus(await postEntry(app, userId), 201).body.data;
    const path = `/v1/users/${userId}/workout-entries/${id}`;
    const res = await http().get(`${path}?unit=lb`).expect(200);
    expect(res.body.data.sets).toEqual([
      {
        setNumber: 1,
        reps: 5,
        weight: 225,
        unit: 'lb',
        original: { weight: 225, unit: 'lb' },
      },
      {
        setNumber: 2,
        reps: 3,
        // 105 / 0.45359237 = 231.4853…
        weight: 231.49,
        unit: 'lb',
        original: { weight: 105, unit: 'kg' },
      },
    ]);
    const wrong = await http().get(`${path}?units=lb`).expect(400);
    expect(wrong.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(wrong.body.code).toBe('VALIDATION_ERROR');
    expect(wrong.body.errors).toEqual([
      {
        path: 'units',
        message: "Unknown query parameter 'units'. Accepted parameters: unit.",
      },
    ]);
    const stone = await http().get(`${path}?unit=stone`).expect(400);
    expect(stone.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(stone.body.errors).toEqual([
      {
        path: 'unit',
        message:
          "Unsupported unit 'stone'. Supported units: kg (kgs), lb (lbs).",
      },
    ]);
  });

  it('the write rule reads the injected clock: 15 minutes after it → 201, 16 minutes → 400 at date', async () => {
    const userId = uniqueUserId();
    withStatus(
      await postEntry(app, userId, entryBody({ date: '2025-02-11T03:15:00Z' })),
      201,
    );
    const late = withStatus(
      await postEntry(app, userId, entryBody({ date: '2025-02-11T03:16:00Z' })),
      400,
    );
    expect(late.body.errors).toEqual([
      { path: 'date', message: expect.any(String) },
    ]);
    expect(await rowsFor(userId)).toEqual({ entries: 1, sets: 2 });
  });

  it('a sets INSERT that fails → 500 and nothing written in either table (one transaction)', async () => {
    const userId = uniqueUserId();
    await withSetTrigger(
      `IF NEW.reps = ${MARKER_REPS} THEN RAISE EXCEPTION 'test failure'; END IF;`,
      async () => {
        const res = withStatus(
          await postEntry(app, userId, entryBody(markedSets)),
          500,
        );
        expect(res.body).toMatchObject({
          code: 'INTERNAL_ERROR',
          requestId: expect.any(String),
        });
      },
    );
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
  });

  it('a connection killed during the sets INSERT → a problem with a requestId, nothing written, and the next POST → 201', async () => {
    const userId = uniqueUserId();
    await withSetTrigger(
      `IF NEW.reps = ${MARKER_REPS} THEN PERFORM pg_sleep(3); END IF;`,
      async () => {
        const pending = postEntry(app, userId, entryBody(markedSets)).then(
          (res) => res,
        );
        await query('SELECT pg_terminate_backend($1)', [
          await backendRunning('insert into "workout_sets"%'),
        ]);
        const res = await pending;
        expect([500, 503]).toContain(res.status);
        expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
        expect(res.body.requestId).toEqual(expect.any(String));
      },
    );
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
    withStatus(await postEntry(app, userId), 201);
    expect(await rowsFor(userId)).toEqual({ entries: 1, sets: 2 });
  });

  const set = (fields: Record<string, unknown>) => ({
    sets: [{ reps: 5, weight: 100, unit: 'kg', ...fields }],
  });

  it.each([
    ['invalid unit', set({ unit: 'stone' }), 'sets[0].unit'],
    ['null date', { date: null }, 'date'],
    ['negative weight', set({ weight: -5 }), 'sets[0].weight'],
    ['negative reps', set({ reps: -1 }), 'sets[0].reps'],
    ['reps 0', set({ reps: 0 }), 'sets[0].reps'],
    ['empty sets', { sets: [] }, 'sets'],
  ])('%s → 400 with its path, nothing written', async (_name, fields, path) => {
    const userId = uniqueUserId();
    const res = withStatus(
      await postEntry(app, userId, entryBody(fields)),
      400,
    );
    expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([{ path, message: expect.any(String) }]);
    expect(await rowsFor(userId)).toEqual({ entries: 0, sets: 0 });
  });

  // Review Focus 4: what people paste, sent percent-encoded as a client does.
  it.each([
    'coach%40example.com',
    'user%3A1',
    'u%201',
    'x'.repeat(65),
    '%C3%BC',
  ])('path userId %s, as sent → 400 naming userId', async (sent) => {
    const id = '0194f2fe-0000-7000-8000-000000000001';
    for (const res of [
      await http()
        .post(`/v1/users/${sent}/workout-entries`)
        .send(entryBody())
        .expect(400),
      await http().get(`/v1/users/${sent}/workout-entries/${id}`).expect(400),
    ]) {
      expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors).toEqual([
        { path: 'userId', message: expect.any(String) },
      ]);
    }
    expect(
      await query('SELECT 1 FROM workout_entries WHERE NOT user_id ~ $1', [
        '^[A-Za-z0-9_.-]{1,64}$',
      ]),
    ).toEqual([]);
  });

  it('an entry id that does not exist → 404; a non-UUID id → 404 NOT_FOUND, not a 500', async () => {
    const userId = uniqueUserId();
    const { id } = withStatus(await postEntry(app, userId), 201).body.data;
    // A non-UUID id is answered as an id that does not exist.
    const body = async (path: string) => {
      const {
        instance: _i,
        requestId: _r,
        ...rest
      } = (await http().get(path).expect(404)).body;
      return rest;
    };
    expect(
      await body(`/v1/users/${userId}/workout-entries/not-a-uuid`),
    ).toEqual(
      await body(
        `/v1/users/${userId}/workout-entries/0194f2fe-0000-7000-8000-000000000001`,
      ),
    );
    const paths = [
      `/v1/users/${userId}/workout-entries/0194f2fe-0000-7000-8000-000000000001`,
      `/v1/users/${userId}/workout-entries/not-a-uuid`,
      // Another user's entry is not found: the read filters by user and id.
      `/v1/users/${uniqueUserId()}/workout-entries/${id}`,
    ];
    for (const path of paths) {
      const res = await http().get(path).expect(404);
      expect(res.headers['content-type']).toMatch(PROBLEM_JSON);
      expect(res.body).toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
        requestId: expect.any(String),
      });
    }
  });
});
