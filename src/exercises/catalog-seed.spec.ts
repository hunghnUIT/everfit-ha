import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_GROUPS_PER_EXERCISE } from '../common/limits';
import {
  DEFAULT_SEED_PATH,
  planSeed,
  readSeedFile,
  SeedFile,
  SeedFileError,
  validateSeedFile,
} from './catalog-seed';
import { exerciseKey } from './exercise-key';

// U+FDFA (ARABIC LIGATURE SALLALLAHOU ALAYHE WASALLAM), one code point that
// NFKC turns into 18, so three of them make a group name of 54 (V-21).
const FDFA = '\u{FDFA}';

const file: SeedFile = {
  muscleGroups: [
    'back',
    'chest',
    'glutes',
    'hamstrings',
    'shoulders',
    'triceps',
  ],
  exercises: [
    {
      name: 'Bench Press',
      key: 'bench press',
      muscleGroups: ['chest', 'shoulders', 'triceps'],
    },
    {
      name: 'Deadlift',
      key: 'deadlift',
      muscleGroups: ['back', 'glutes', 'hamstrings'],
    },
  ],
};

const noLedger = { exercises: new Set<string>(), groups: new Set<string>() };
const fullLedger = {
  exercises: new Set(['bench press', 'deadlift']),
  groups: new Set(file.muscleGroups),
};
const allGroups = new Set(file.muscleGroups);

describe('planSeed (design §10.3)', () => {
  it('first run: every group and exercise', () =>
    expect(planSeed(file, noLedger, new Set())).toEqual({
      groups: file.muscleGroups,
      exercises: file.exercises,
      warnings: [],
    }));

  it('re-run with a full ledger: an empty plan', () =>
    expect(planSeed(file, fullLedger, allGroups)).toEqual({
      groups: [],
      exercises: [],
      warnings: [],
    }));

  it('a new file item: only that item', () => {
    const squat = {
      name: 'Squat',
      key: 'squat',
      muscleGroups: ['quads', 'glutes'],
    };
    const grown: SeedFile = {
      muscleGroups: [...file.muscleGroups, 'quads'],
      exercises: [...file.exercises, squat],
    };
    expect(planSeed(grown, fullLedger, allGroups)).toEqual({
      groups: ['quads'],
      exercises: [squat],
      warnings: [],
    });
  });

  it('an exercise an admin edited (still in the ledger) is not planned', () => {
    // The admin's edit lives in the tables; planSeed never looks at an item
    // the ledger holds, whatever the tables say now.
    expect(planSeed(file, fullLedger, allGroups).exercises).toEqual([]);
  });

  it('an item in the ledger that no longer exists (deleted by an admin) is not planned', () => {
    // The admin deleted Deadlift: its ledger row stays, its table row is gone.
    const plan = planSeed(file, fullLedger, allGroups);
    expect(plan.exercises.map((e) => e.key)).not.toContain('deadlift');
  });

  it('an exercise an admin created before the file added it is still planned; runSeed writes no links for it', () => {
    // planSeed does not see exercise keys: the INSERT … ON CONFLICT DO NOTHING
    // RETURNING of runSeed returns no row, so no links are written.
    const ledger = { exercises: new Set(['deadlift']), groups: allGroups };
    expect(planSeed(file, ledger, allGroups).exercises).toEqual([
      file.exercises[0],
    ]);
  });

  it('an item removed from the file, or changed in it, is not planned again', () => {
    const changed: SeedFile = {
      muscleGroups: file.muscleGroups,
      // Deadlift removed; Bench Press given other groups.
      exercises: [{ ...file.exercises[0], muscleGroups: ['chest'] }],
    };
    expect(planSeed(changed, fullLedger, allGroups)).toEqual({
      groups: [],
      exercises: [],
      warnings: [],
    });
  });

  it('an exercise whose group was deleted: inserted with the rest, with a warning; with no group left, skipped and not recorded', () => {
    // An admin deleted "triceps" and "back" after an earlier seed recorded them.
    const ledger = { exercises: new Set<string>(), groups: allGroups };
    const existing = new Set(['chest', 'glutes', 'hamstrings', 'shoulders']);
    const onlyBack: SeedFile = {
      muscleGroups: file.muscleGroups,
      exercises: [
        ...file.exercises,
        { name: 'Pull-Up', key: 'pull-up', muscleGroups: ['back'] },
      ],
    };
    expect(planSeed(onlyBack, ledger, existing)).toEqual({
      groups: [],
      exercises: [
        {
          name: 'Bench Press',
          key: 'bench press',
          muscleGroups: ['chest', 'shoulders'],
        },
        {
          name: 'Deadlift',
          key: 'deadlift',
          muscleGroups: ['glutes', 'hamstrings'],
        },
      ],
      warnings: [
        'Seed: "Bench Press" is inserted without the muscle group "triceps", which no longer exists.',
        'Seed: "Deadlift" is inserted without the muscle group "back", which no longer exists.',
        'Seed: "Pull-Up" is skipped: none of its muscle groups (back) exists. It is not recorded, so a later run inserts it once one does.',
      ],
    });
  });
});

const validFile = () => ({
  muscleGroups: [
    'Back',
    'chest',
    'glutes',
    'hamstrings',
    'shoulders',
    'triceps',
  ],
  exercises: [
    { name: ' Bench  Press ', muscleGroups: ['chest', 'Shoulders', 'triceps'] },
    { name: 'Deadlift', muscleGroups: ['back', 'glutes', 'hamstrings'] },
  ],
});

describe('validateSeedFile (design §10.3, step 1)', () => {
  // The stored display name is trimmed with inner whitespace collapsed, the
  // same form the admin routes store (§10.5).
  it('accepts a valid file and returns normalised values with keys', () =>
    expect(validateSeedFile(validFile())).toEqual({
      ok: true,
      value: {
        muscleGroups: [
          'back',
          'chest',
          'glutes',
          'hamstrings',
          'shoulders',
          'triceps',
        ],
        exercises: [
          {
            name: 'Bench Press',
            key: 'bench press',
            muscleGroups: ['chest', 'shoulders', 'triceps'],
          },
          {
            name: 'Deadlift',
            key: 'deadlift',
            muscleGroups: ['back', 'glutes', 'hamstrings'],
          },
        ],
      },
    }));

  const cases: [
    string,
    (f: ReturnType<typeof validFile>) => unknown,
    string,
  ][] = [
    [
      'duplicate keys',
      (f) => {
        f.exercises.push({ name: 'BENCH PRESS', muscleGroups: ['chest'] });
        return f;
      },
      'exercises[2].name',
    ],
    [
      'a group not in muscleGroups',
      (f) => {
        f.exercises[1].muscleGroups.push('quads');
        return f;
      },
      'exercises[1].muscleGroups[3]',
    ],
    [
      'a malformed item',
      (f) => ({ ...f, exercises: [f.exercises[0], { name: 'Squat' }] }),
      'exercises[1].muscleGroups',
    ],
    [
      'a 101-character name',
      (f) => {
        f.exercises[1].name = 'A'.repeat(101);
        return f;
      },
      'exercises[1].name',
    ],
    [
      'a group of three U+FDFA',
      (f) => {
        f.muscleGroups.push(FDFA.repeat(3));
        return f;
      },
      'muscleGroups[6]',
    ],
  ];

  it.each(cases)(
    'validateSeedFile refuses %s, naming the item',
    (_, change, path) => {
      const result = validateSeedFile(change(validFile()));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.map((e) => e.path)).toEqual([path]);
    },
  );

  it('refuses a group listed twice after normalising', () => {
    const f = validFile();
    f.muscleGroups.push(' CHEST ');
    expect(validateSeedFile(f)).toEqual({
      ok: false,
      errors: [
        {
          path: 'muscleGroups[6]',
          message:
            'The muscle group "chest" is already listed at muscleGroups[1].',
        },
      ],
    });
  });

  it(`refuses an exercise with more than ${MAX_GROUPS_PER_EXERCISE} muscle groups`, () => {
    const groups = Array.from({ length: 11 }, (_, i) => `group ${i}`);
    const result = validateSeedFile({
      muscleGroups: groups,
      exercises: [{ name: 'Everything', muscleGroups: groups }],
    });
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: 'exercises[0].muscleGroups',
          message: `An exercise has at most ${MAX_GROUPS_PER_EXERCISE} muscle groups; this one has 11.`,
        },
      ],
    });
  });

  it('refuses a file that is not a JSON object', () =>
    expect(validateSeedFile([])).toEqual({
      ok: false,
      errors: [
        { path: '(file)', message: 'The seed file must be a JSON object.' },
      ],
    }));

  it("de-duplicates an exercise's groups after normalising", () => {
    const f = validFile();
    f.exercises[0].muscleGroups = ['chest', 'Chest ', 'triceps'];
    const result = validateSeedFile(f);
    expect(result.ok && result.value.exercises[0].muscleGroups).toEqual([
      'chest',
      'triceps',
    ]);
  });

  it.each([
    ['an empty nested array', []],
    ['a nested array holding a valid item', [validFile().exercises[1]]],
  ])('refuses %s as an exercise item at exercises[0]', (_, item) =>
    expect(
      validateSeedFile({
        muscleGroups: validFile().muscleGroups,
        exercises: [item],
      }),
    ).toEqual({
      ok: false,
      errors: [
        { path: 'exercises[0]', message: 'An exercise must be a JSON object.' },
      ],
    }),
  );

  it.each([
    ['exercises: [1]', { muscleGroups: ['chest'], exercises: [1] }],
    ["exercises: ['x']", { muscleGroups: ['chest'], exercises: ['x'] }],
    ['exercises: [null]', { muscleGroups: ['chest'], exercises: [null] }],
    ['exercises: [true]', { muscleGroups: ['chest'], exercises: [true] }],
    ['muscleGroups: [[]]', { muscleGroups: [[]], exercises: [] }],
    ['muscleGroups: [{}]', { muscleGroups: [{}], exercises: [] }],
  ])('returns a refusal for %s and never throws', (_, json) => {
    let result: unknown;
    expect(() => {
      result = validateSeedFile(json);
    }).not.toThrow();
    expect(result).toMatchObject({ ok: false });
  });

  it('refuses a key property on an item, naming it (the key is computed)', () => {
    const f = validFile();
    const exercises = [
      ...f.exercises,
      { name: 'Squat', key: 'back squat', muscleGroups: ['glutes'] },
    ];
    const result = validateSeedFile({ ...f, exercises });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.path)).toEqual([
      'exercises[2].key',
    ]);
  });

  it('refuses an unknown top-level property, naming it', () => {
    const result = validateSeedFile({ ...validFile(), notes: 'draft' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.map((e) => e.path)).toEqual(['notes']);
  });
});

describe('the seed file', () => {
  it('DEFAULT_SEED_PATH resolves to seed/exercise-catalog.seed.json from src/exercises', () =>
    expect(existsSync(DEFAULT_SEED_PATH)).toBe(true));

  const result = validateSeedFile(
    JSON.parse(readFileSync(DEFAULT_SEED_PATH, 'utf8')),
  );

  it('passes validateSeedFile', () =>
    expect(result).toMatchObject({ ok: true }));

  const seed = result.ok ? result.value : { muscleGroups: [], exercises: [] };

  it('holds 60 to 100 exercises, each with 1 to MAX_GROUPS_PER_EXERCISE groups', () => {
    expect(seed.exercises.length).toBeGreaterThanOrEqual(60);
    expect(seed.exercises.length).toBeLessThanOrEqual(100);
    for (const e of seed.exercises) {
      expect(e.muscleGroups.length).toBeGreaterThanOrEqual(1);
      expect(e.muscleGroups.length).toBeLessThanOrEqual(
        MAX_GROUPS_PER_EXERCISE,
      );
    }
  });

  it('every key is what exerciseKey(name) gives', () => {
    for (const e of seed.exercises) expect(e.key).toBe(exerciseKey(e.name));
  });

  it('holds Bench Press and Deadlift exactly as the examples use them', () =>
    expect(seed.exercises).toEqual(
      expect.arrayContaining([
        {
          name: 'Bench Press',
          key: 'bench press',
          muscleGroups: ['chest', 'shoulders', 'triceps'],
        },
        {
          name: 'Deadlift',
          key: 'deadlift',
          muscleGroups: ['back', 'glutes', 'hamstrings'],
        },
      ]),
    ));
});

describe('readSeedFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-unit-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // The thrown error, so its type and message can be checked.
  const failureOf = (path: string): unknown => {
    try {
      readSeedFile(path);
      return undefined;
    } catch (error) {
      return error;
    }
  };

  const expectFileError = (path: string, ...parts: string[]) => {
    const error = failureOf(path);
    expect(error).toBeInstanceOf(SeedFileError);
    const message = (error as SeedFileError).message;
    for (const part of [path, ...parts]) expect(message).toContain(part);
    expect(message).not.toContain('postgres://');
  };

  it('a missing file throws SeedFileError naming the file', () =>
    expectFileError(join(dir, 'missing.json'), '(file)'));

  it('a file that is not JSON throws SeedFileError naming the file', () => {
    const path = join(dir, 'not-json.json');
    writeFileSync(path, 'muscleGroups: chest');
    expectFileError(path, '(file): cannot be read as JSON');
  });

  it('an invalid file throws SeedFileError naming the file and the item path', () => {
    const path = join(dir, 'invalid.json');
    writeFileSync(
      path,
      JSON.stringify({
        muscleGroups: ['chest'],
        exercises: [{ name: 'Bench Press', muscleGroups: ['legs'] }],
      }),
    );
    expectFileError(path, 'exercises[0].muscleGroups[0]:');
  });
});
