import 'reflect-metadata';
import fc from 'fast-check';
import { UnitRegistry } from '../units/unit-registry';
import { parseWriteDate } from './domain/dates';
import { SHAPE_MESSAGES } from './dto/entry-input.dto';
import { readEntryInputs } from './entry-input';

const deps = {
  units: new UnitRegistry(),
  now: Temporal.Instant.from('2025-02-11T00:00:00Z'),
};

const PATH_USER = 'u_123';

// At least ten times the measured time of the case each bounds (see the
// report): about 155 ms, and under 3 ms for a 200 000-character name.
const BUDGET_MS = 2_000;
const LONG_NAME_BUDGET_MS = 100;

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

const oneSet = (set: Record<string, unknown>) => ({
  ...benchPress(),
  sets: [{ reps: 5, weight: 100, unit: 'kg', ...set }],
});

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

  it('takes "userId": null as absent, and still refuses a different userId', () => {
    expect(single({ ...benchPress(), userId: null }).ok).toBe(true);
    expect(errorsOf(single({ ...benchPress(), userId: 'u_999' }))).toEqual([
      {
        path: 'userId',
        message: "'u_999' does not match the userId in the path, 'u_123'.",
      },
    ]);
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
    expect(errorsOf(single(body))).toEqual([
      {
        path: 'sets[0].reps',
        message: `'reps' must be a JSON number, not a string: send 5, not "5".`,
      },
      {
        path: 'sets[0].weight',
        message: `'weight' must be a JSON number, not a string: send 225, not "225".`,
      },
    ]);
  });

  it('words a non-numeric string without echoing it as a number', () =>
    expect(errorsOf(single(oneSet({ weight: 'heavy' })))).toEqual([
      {
        path: 'sets[0].weight',
        message: `'weight' must be a JSON number, not a string, for example 100.`,
      },
    ]));

  const fiftyOneSets = Array.from({ length: 51 }, () => ({
    reps: 5,
    weight: 100,
    unit: 'kg',
  }));

  it.each([
    ['weight 10.1234', 'sets[0].weight', oneSet({ weight: 10.1234 })],
    ['weight 10 000.001', 'sets[0].weight', oneSet({ weight: 10_000.001 })],
    ['weight 1e-7', 'sets[0].weight', oneSet({ weight: 1e-7 })],
    ['reps 1 001', 'sets[0].reps', oneSet({ reps: 1_001 })],
    ['reps 5.5', 'sets[0].reps', oneSet({ reps: 5.5 })],
    ['51 sets', 'sets', { ...benchPress(), sets: fiftyOneSets }],
    ['weight null', 'sets[0].weight', oneSet({ weight: null })],
    ['unit 5', 'sets[0].unit', oneSet({ unit: 5 })],
    ['sets: [[]]', 'sets[0]', { ...benchPress(), sets: [[]] }],
    ['sets: [null]', 'sets[0]', { ...benchPress(), sets: [null] }],
  ])('%s → one error at %s', (_label, path, body) =>
    expect(pathsOf(single(body))).toEqual([path]),
  );

  it.each([
    ['no sets', { ...benchPress(), sets: [] }],
    [
      '51 object sets with a bad unit',
      {
        ...benchPress(),
        sets: Array.from({ length: 51 }, () => ({
          reps: 5,
          weight: 100,
          unit: 'stone',
        })),
      },
    ],
    [
      '51 non-object sets',
      { ...benchPress(), sets: Array.from({ length: 51 }, () => 0) },
    ],
  ])('%s → the one sets error, with the expected shape', (_label, body) =>
    expect(errorsOf(single(body))).toEqual([
      { path: 'sets', message: SHAPE_MESSAGES.sets },
    ]),
  );

  it('an entry over the sets cap gets one error there; the other entries are still checked', () => {
    const body = {
      entries: [
        oneSet({ unit: 'stone' }),
        { ...benchPress(), sets: Array.from({ length: 51 }, () => 0) },
      ],
    };
    expect(errorsOf(bulk(body))).toEqual([
      { path: 'entries[1].sets', message: SHAPE_MESSAGES.sets },
      { path: 'entries[0].sets[0].unit', message: UNKNOWN_UNIT },
    ]);
  });

  it.each([
    ['no entries', { entries: [] }],
    ['101 entries', { entries: Array.from({ length: 101 }, benchPress) }],
    [
      '20 000 non-object entries',
      { entries: Array.from({ length: 20_000 }, () => 0) },
    ],
  ])('%s → the one entries error, with no per-item errors', (_label, body) =>
    expect(errorsOf(bulk(body))).toEqual([
      { path: 'entries', message: SHAPE_MESSAGES.entries },
    ]),
  );

  it('reads the largest invalid body inside the caps in well under a second', () => {
    // 100 entries × 50 sets, every reps and weight a string: 10 000 errors.
    const body = {
      entries: Array.from({ length: 100 }, () => ({
        ...benchPress(),
        sets: Array.from({ length: 50 }, () => ({
          reps: '5',
          weight: '100',
          unit: 'kg',
        })),
      })),
    };
    const start = performance.now();
    const errors = errorsOf(bulk(body));
    const elapsed = performance.now() - start;
    expect(errors).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  // A property name is the client's text: a lookup must not cost more for a
  // name made of the separators a path uses.
  describe.each([
    ['dots', '.'.repeat(200_000)],
    ['brackets', '['.repeat(200_000)],
  ])('an unknown property named with 200 000 %s', (_label, name) => {
    const unknown = (path: string) => ({
      path,
      message: `property ${name} should not exist`,
    });
    const timed = (run: () => ReturnType<typeof single>) => {
      const start = performance.now();
      const errors = errorsOf(run());
      return { errors, elapsed: performance.now() - start };
    };

    it('at the top level → its one error, quickly', () => {
      const { errors, elapsed } = timed(() =>
        single({ ...benchPress(), [name]: 1 }),
      );
      expect(errors).toEqual([unknown(name)]);
      expect(elapsed).toBeLessThan(LONG_NAME_BUDGET_MS);
    });

    it('inside an entry of a bulk body → its one error, quickly', () => {
      const { errors, elapsed } = timed(() =>
        bulk({ entries: [{ ...benchPress(), [name]: 1 }] }),
      );
      expect(errors).toEqual([unknown(`entries[0].${name}`)]);
      expect(elapsed).toBeLessThan(LONG_NAME_BUDGET_MS);
    });

    it('inside a set → its one error, quickly', () => {
      const { errors, elapsed } = timed(() => single(oneSet({ [name]: 1 })));
      expect(errors).toEqual([unknown(`sets[0].${name}`)]);
      expect(elapsed).toBeLessThan(LONG_NAME_BUDGET_MS);
    });
  });

  it.each([
    ['3 items', 3],
    ['101 items', 101],
  ])(
    'an entries array of %s on the single route is an unknown property',
    (_label, length) =>
      expect(
        errorsOf(
          single({
            ...benchPress(),
            entries: Array.from({ length }, benchPress),
          }),
        ),
      ).toEqual([
        { path: 'entries', message: 'property entries should not exist' },
      ]),
  );

  it.each(['05', '007', '5.', '-0', '0.50', ' 5', 'Infinity'])(
    'a string %p that JSON would not print as a number gets the fixed example',
    (reps) =>
      expect(errorsOf(single(oneSet({ reps })))).toEqual([
        {
          path: 'sets[0].reps',
          message: `'reps' must be a JSON number, not a string, for example 5.`,
        },
      ]),
  );

  it('keeps weight 0.125 (a micro-plate) as the exact string', () => {
    const result = single(oneSet({ weight: 0.125 }));
    expect(result.ok && result.value[0].sets[0]).toMatchObject({
      weight: '0.125',
      weightKg: '0.125',
    });
  });

  it('accepts weight 0 (a bodyweight set)', () => {
    const result = single(oneSet({ weight: 0 }));
    expect(result.ok && result.value[0].sets[0]).toMatchObject({
      weight: '0',
      weightKg: '0',
    });
  });

  it.each([
    ['no body', 'single', '', undefined, SHAPE_MESSAGES.singleBody],
    ['an array', 'single', '', [benchPress()], SHAPE_MESSAGES.singleBody],
    ['null', 'single', '', null, SHAPE_MESSAGES.singleBody],
    ['{} (an empty JSON body)', 'single', '', {}, SHAPE_MESSAGES.singleBody],
    [
      '"sets": {}',
      'single',
      'sets',
      { ...benchPress(), sets: {} },
      SHAPE_MESSAGES.sets,
    ],
    [
      '{ "entries": [null] }',
      'bulk',
      'entries[0]',
      { entries: [null] },
      SHAPE_MESSAGES.entry,
    ],
    ['a bare array', 'bulk', '', [benchPress()], SHAPE_MESSAGES.bulkBody],
    ['{} (an empty JSON body)', 'bulk', 'entries', {}, SHAPE_MESSAGES.entries],
  ] as const)(
    '%s on %s → one error at %p showing the expected shape',
    (_label, shape, path, body, message) =>
      expect(errorsOf(readEntryInputs(body, shape, PATH_USER, deps))).toEqual([
        { path, message },
      ]),
  );

  it('an object with some property is read field by field, not as a shape error', () =>
    expect(pathsOf(single({ date: '2025-02-10T05:30:00+07:00' }))).toEqual([
      'exerciseName',
      'sets',
    ]));

  // Nest's ValidationPipe strips these keys before class-transformer, which
  // throws on a truthy non-class "constructor"; readEntryInputs must too.
  it('"date": {"constructor": 1} → one error at date, and the input is not changed', () => {
    const text = JSON.stringify({ ...benchPress(), date: { constructor: 1 } });
    const body: unknown = JSON.parse(text);
    expect(pathsOf(single(body))).toEqual(['date']);
    expect(JSON.stringify(body)).toBe(text);
  });

  it.each([
    [
      "a set's weight",
      '{"weight":{"constructor":1,"__proto__":{"a":1}}}',
      'sets',
    ],
    [
      'an unknown property',
      '{"extra":{"constructor":"x","prototype":1}}',
      'top',
    ],
    ['two levels down', '{"extra":{"a":{"constructor":true}}}', 'top'],
  ])(
    'a prototype key in %s gives a Check, never a throw',
    (_label, json, where) => {
      const inner = JSON.parse(json) as Record<string, unknown>;
      const body =
        where === 'sets'
          ? { ...benchPress(), sets: [{ reps: 5, unit: 'kg', ...inner }] }
          : { ...benchPress(), ...inner };
      const result = single(JSON.parse(JSON.stringify(body)));
      expect(result.ok).toBe(false);
    },
  );

  it('never throws, and gives one error per path, for any JSON (keys biased to prototype names)', () => {
    const key = fc.oneof(
      fc.constantFrom(
        'constructor',
        '__proto__',
        'prototype',
        'toString',
        'valueOf',
      ),
      fc.constantFrom(
        'date',
        'exerciseName',
        'userId',
        'sets',
        'reps',
        'weight',
        'unit',
        'entries',
      ),
      fc.string({ maxLength: 4 }),
    );
    const { value } = fc.letrec((tie) => ({
      value: fc.oneof(
        { depthSize: 'small' },
        fc.jsonValue({ maxDepth: 0 }),
        fc.array(tie('value'), { maxLength: 3 }),
        fc.dictionary(key, tie('value'), { maxKeys: 4 }),
      ),
    }));
    const set = fc.oneof(
      value,
      fc.record(
        { reps: value, weight: value, unit: value },
        { requiredKeys: [] },
      ),
    );
    const entry = fc.oneof(
      value,
      fc.record(
        {
          date: value,
          exerciseName: value,
          userId: value,
          sets: fc.oneof(value, fc.array(set, { maxLength: 3 })),
          constructor: value,
        },
        { requiredKeys: [] },
      ),
    );
    const body = fc.oneof(
      entry,
      fc.record({
        entries: fc.oneof(value, fc.array(entry, { maxLength: 3 })),
      }),
    );
    fc.assert(
      fc.property(
        body,
        fc.constantFrom('single' as const, 'bulk' as const),
        (raw, shape) => {
          // Through JSON text, as a request arrives: own __proto__ keys included.
          const parsed: unknown = JSON.parse(JSON.stringify(raw) ?? 'null');
          const result = readEntryInputs(parsed, shape, PATH_USER, deps);
          if (result.ok) return;
          const paths = result.errors.map((error) => error.path);
          expect(paths.length).toBeGreaterThan(0);
          expect(new Set(paths).size).toBe(paths.length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('assigns v7 ids that increase in input order', () => {
    const names = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Row'];
    const result = bulk({
      entries: names.map((exerciseName) => ({ ...benchPress(), exerciseName })),
    });
    const entries = result.ok ? result.value : [];
    expect(entries.map((entry) => entry.exerciseName)).toEqual(names);
    const ids = entries.map((entry) => entry.id);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    }
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(5);
  });
});
