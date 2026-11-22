import 'reflect-metadata';
import { UnitRegistry } from '../units/unit-registry';
import { parseWriteDate } from './domain/dates';
import { readEntryInputs } from './entry-input';

const deps = {
  units: new UnitRegistry(),
  now: Temporal.Instant.from('2025-02-11T00:00:00Z'),
};

const PATH_USER = 'u_123';

// The request of design §9.1.
const benchPress = () => ({
  date: '2025-02-10T05:30:00+07:00',
  exerciseName: 'Bench Press',
  sets: [
    { reps: 5, weight: 225, unit: 'lbs' },
    { reps: 3, weight: 105, unit: 'kg' },
  ],
});

const single = (body: unknown) =>
  readEntryInputs(body, 'single', PATH_USER, deps);
const bulk = (body: unknown) => readEntryInputs(body, 'bulk', PATH_USER, deps);

const errorsOf = (result: ReturnType<typeof single>) =>
  result.ok ? [] : result.errors;
const pathsOf = (result: ReturnType<typeof single>) =>
  errorsOf(result).map((error) => error.path);

const UNKNOWN_UNIT =
  "Unsupported unit 'stone'. Supported units: kg (kgs), lb (lbs).";

describe('readEntryInputs (design §9.1)', () => {
  it('reads the §9.1 request into one NewEntry with exact decimal strings', () => {
    const result = single({ ...benchPress(), userId: PATH_USER });
    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: expect.any(String),
          userId: PATH_USER,
          exerciseName: 'Bench Press',
          exerciseKey: 'bench press',
          performedAt: new Date('2025-02-09T22:30:00.000Z'),
          utcOffsetMinutes: 420,
          sets: [
            {
              setNumber: 1,
              reps: 5,
              weight: '225',
              unit: 'lb',
              weightKg: '102.05828325',
            },
            {
              setNumber: 2,
              reps: 3,
              weight: '105',
              unit: 'kg',
              weightKg: '105',
            },
          ],
        },
      ],
    });
  });

  it('collects every fault of one entry in one result', () => {
    const noOffset = '2025-02-10T06:30:00';
    const body = {
      ...benchPress(),
      date: noOffset,
      userId: 'u_999',
      sets: [{ reps: 5, weight: 100, unit: 'stone' }],
    };
    const dateError = parseWriteDate(noOffset, 'date', deps.now);
    expect(dateError.ok).toBe(false);
    expect(errorsOf(single(body))).toEqual(
      expect.arrayContaining([
        ...(dateError.ok ? [] : dateError.errors),
        { path: 'sets[0].unit', message: UNKNOWN_UNIT },
        {
          path: 'userId',
          message: "'u_999' does not match the userId in the path, 'u_123'.",
        },
      ]),
    );
    expect(pathsOf(single(body))).toHaveLength(3);
  });

  it('collects faults of different bulk items, each under entries[i]', () => {
    const body = {
      entries: [
        { ...benchPress(), sets: [{ reps: 5, weight: 100, unit: 'stone' }] },
        { ...benchPress(), date: '2025-02-10T06:30:00' },
        { ...benchPress(), userId: 'u_999' },
      ],
    };
    expect(pathsOf(bulk(body)).sort()).toEqual([
      'entries[0].sets[0].unit',
      'entries[1].date',
      'entries[2].userId',
    ]);
  });

  it('runs a cross-field rule unless a field it reads failed', () => {
    // Another field of the item failed: the userId rule still runs.
    expect(
      pathsOf(single({ ...benchPress(), exerciseName: 5, userId: 'u_999' })),
    ).toEqual(['exerciseName', 'userId']);
    // The field the rule reads failed: only that field's own error.
    const wrongType = errorsOf(single({ ...benchPress(), userId: 42 }));
    expect(wrongType).toEqual([
      { path: 'userId', message: expect.any(String) },
    ]);
    expect(wrongType[0].message).not.toMatch(/does not match/);
  });

  it('gives one error per path: "date": null and a 101-character name each give exactly one', () => {
    expect(pathsOf(single({ ...benchPress(), date: null }))).toEqual(['date']);
    expect(
      pathsOf(single({ ...benchPress(), exerciseName: 'x'.repeat(101) })),
    ).toEqual(['exerciseName']);
  });

  it('refuses "weight": "225" and "reps": "5" at sets[0].weight and sets[0].reps', () => {
    const body = {
      ...benchPress(),
      sets: [{ reps: '5', weight: '225', unit: 'lb' }],
    };
    expect(pathsOf(single(body)).sort()).toEqual([
      'sets[0].reps',
      'sets[0].weight',
    ]);
  });

  const oneSet = (set: Record<string, unknown>) => ({
    ...benchPress(),
    sets: [{ reps: 5, weight: 100, unit: 'kg', ...set }],
  });

  it.each([
    ['weight 10.1234', oneSet({ weight: 10.1234 }), 'sets[0].weight'],
    ['weight 10 000.001', oneSet({ weight: 10_000.001 }), 'sets[0].weight'],
    ['weight 1e-7', oneSet({ weight: 1e-7 }), 'sets[0].weight'],
    ['reps 1 001', oneSet({ reps: 1_001 }), 'sets[0].reps'],
    ['reps 5.5', oneSet({ reps: 5.5 }), 'sets[0].reps'],
    [
      '51 sets',
      {
        ...benchPress(),
        sets: Array.from({ length: 51 }, () => ({
          reps: 5,
          weight: 100,
          unit: 'kg',
        })),
      },
      'sets',
    ],
  ])('%s → one error at %s', (_label, body, path) =>
    expect(pathsOf(single(body))).toEqual([path]),
  );

  it('accepts weight 0 (a bodyweight set)', () => {
    const result = single(oneSet({ weight: 0 }));
    expect(result.ok && result.value[0].sets[0]).toMatchObject({
      weight: '0',
      weightKg: '0',
    });
  });

  it.each([
    ['no body', 'single', undefined, '', '"exerciseName"'],
    ['an array', 'single', [benchPress()], '', '"exerciseName"'],
    ['null', 'single', null, '', '"exerciseName"'],
    ['"sets": {}', 'single', { ...benchPress(), sets: {} }, 'sets', '"reps"'],
    [
      '{ "entries": [null] }',
      'bulk',
      { entries: [null] },
      'entries[0]',
      '"exerciseName"',
    ],
    ['a bare array', 'bulk', [benchPress()], '', '"entries"'],
  ] as const)(
    '%s on %s → one error at %p showing the expected shape',
    (_label, shape, body, path, shown) => {
      const errors = errorsOf(readEntryInputs(body, shape, PATH_USER, deps));
      expect(errors).toEqual([{ path, message: expect.any(String) }]);
      expect(errors[0].message).toContain(shown);
    },
  );

  it('assigns v7 ids that increase in input order', () => {
    const result = bulk({ entries: Array.from({ length: 5 }, benchPress) });
    const ids = result.ok ? result.value.map((entry) => entry.id) : [];
    expect(ids).toHaveLength(5);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    }
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(5);
  });
});
