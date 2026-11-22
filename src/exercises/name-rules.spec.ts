import { checkExerciseName, checkMuscleGroupName } from './name-rules';

// U+FDFA, one code point that NFKC turns into 18 (V-21).
const FDFA = 'ﷺ';
// İ (U+0130), which lower-cases to two code points: i + U+0307 (V-21).
const DOTTED_I = 'İ';

describe('checkExerciseName (design §10.1)', () => {
  it('refuses 100 × U+FDFA (a key of 1 800) with the field named', () =>
    expect(checkExerciseName(FDFA.repeat(100), 'exerciseName')).toEqual({
      ok: false,
      errors: [
        {
          path: 'exerciseName',
          message:
            'The name becomes 1800 characters once normalised; the limit is 100.',
        },
      ],
    }));

  it('refuses 100 × İ (a key of 200)', () =>
    expect(checkExerciseName(DOTTED_I.repeat(100), 'name')).toEqual({
      ok: false,
      errors: [
        {
          path: 'name',
          message:
            'The name becomes 200 characters once normalised; the limit is 100.',
        },
      ],
    }));

  it('accepts a 100-character ASCII name; refuses 101 characters and "   "', () => {
    const hundred = 'A'.repeat(100);
    expect(checkExerciseName(hundred, 'name')).toEqual({
      ok: true,
      value: { name: hundred, key: 'a'.repeat(100) },
    });
    expect(checkExerciseName('A'.repeat(101), 'name')).toEqual({
      ok: false,
      errors: [
        {
          path: 'name',
          message: 'The name must be at most 100 characters; it has 101.',
        },
      ],
    });
    expect(checkExerciseName('   ', 'name')).toEqual({
      ok: false,
      errors: [{ path: 'name', message: 'The name must not be blank.' }],
    });
  });

  it('returns the trimmed input as the name and its key', () =>
    expect(checkExerciseName('  ZERCHER   squat ', 'name')).toEqual({
      ok: true,
      value: { name: 'ZERCHER   squat', key: 'zercher squat' },
    }));

  it('counts the name in code points: 100 × 💪 is accepted', () =>
    expect(checkExerciseName('\u{1F4AA}'.repeat(100), 'name')).toEqual({
      ok: true,
      value: { name: '\u{1F4AA}'.repeat(100), key: '\u{1F4AA}'.repeat(100) },
    }));

  it('refuses a value that is not a string', () =>
    expect(checkExerciseName(42, 'entries[0].exerciseName')).toEqual({
      ok: false,
      errors: [
        {
          path: 'entries[0].exerciseName',
          message: 'The name must be a string.',
        },
      ],
    }));
});

describe('checkMuscleGroupName (design §10.1)', () => {
  it('refuses a group of three U+FDFA (54 once normalised) and "chest!"; accepts "Rear-Delts 2" as "rear-delts 2"', () => {
    expect(checkMuscleGroupName(FDFA.repeat(3), 'muscleGroups[0]')).toEqual({
      ok: false,
      errors: [
        {
          path: 'muscleGroups[0]',
          message:
            'The muscle group name becomes 54 characters once normalised; the limit is 40.',
        },
      ],
    });
    expect(checkMuscleGroupName('chest!', 'name')).toEqual({
      ok: false,
      errors: [
        {
          path: 'name',
          message:
            'The muscle group name may contain only letters, digits, spaces and hyphens.',
        },
      ],
    });
    expect(checkMuscleGroupName('Rear-Delts 2', 'name')).toEqual({
      ok: true,
      value: 'rear-delts 2',
    });
  });

  it('accepts 40 characters and refuses 41, measured after normalising', () => {
    expect(checkMuscleGroupName(` ${'B'.repeat(40)} `, 'name')).toEqual({
      ok: true,
      value: 'b'.repeat(40),
    });
    expect(checkMuscleGroupName('B'.repeat(41), 'name')).toEqual({
      ok: false,
      errors: [
        {
          path: 'name',
          message:
            'The muscle group name becomes 41 characters once normalised; the limit is 40.',
        },
      ],
    });
  });

  it('refuses a blank name and a value that is not a string', () => {
    expect(checkMuscleGroupName(' \t ', 'name')).toEqual({
      ok: false,
      errors: [
        { path: 'name', message: 'The muscle group name must not be blank.' },
      ],
    });
    expect(checkMuscleGroupName(null, 'muscleGroup')).toEqual({
      ok: false,
      errors: [
        {
          path: 'muscleGroup',
          message: 'The muscle group name must be a string.',
        },
      ],
    });
  });
});
