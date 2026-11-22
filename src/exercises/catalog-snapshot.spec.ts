import { CatalogSnapshot } from './catalog-snapshot';

describe('CatalogSnapshot', () => {
  const snapshot = new CatalogSnapshot(
    {
      exercises: [
        {
          key: 'bench press',
          name: 'Bench Press',
          muscleGroups: ['chest', 'shoulders', 'triceps'],
        },
        { key: 'push-up', name: 'Push-Up', muscleGroups: ['chest', 'triceps'] },
      ],
      groups: ['triceps', 'chest', 'neck', 'shoulders'],
    },
    7,
  );

  it('an unknown key has no groups; a group no exercise uses is still known', () => {
    expect(snapshot.muscleGroupsFor('zercher squat')).toEqual([]);
    expect(snapshot.muscleGroupsFor('bench press')).toEqual([
      'chest',
      'shoulders',
      'triceps',
    ]);

    expect(snapshot.hasMuscleGroup('neck')).toBe(true);
    expect(snapshot.keysForMuscleGroup('neck')).toEqual([]);
    expect(snapshot.hasMuscleGroup('calves')).toBe(false);
    expect(snapshot.keysForMuscleGroup('calves')).toEqual([]);

    expect(snapshot.keysForMuscleGroup('triceps')).toEqual([
      'bench press',
      'push-up',
    ]);
    expect(snapshot.knownMuscleGroups()).toEqual([
      'chest',
      'neck',
      'shoulders',
      'triceps',
    ]);
    expect(snapshot.list().map((exercise) => exercise.key)).toEqual([
      'bench press',
      'push-up',
    ]);
    expect(snapshot.loadNumber).toBe(7);
  });

  it('is immutable: the rows it was built from and the arrays it returns cannot change it', () => {
    const groups = ['chest'];
    const rows = {
      exercises: [{ key: 'dip', name: 'Dip', muscleGroups: groups }],
      groups: ['chest'],
    };
    const built = new CatalogSnapshot(rows, 1);

    groups.push('triceps');
    rows.groups.push('triceps');

    expect(built.muscleGroupsFor('dip')).toEqual(['chest']);
    expect(built.hasMuscleGroup('triceps')).toBe(false);
    expect(Object.isFrozen(built.muscleGroupsFor('dip'))).toBe(true);
    expect(Object.isFrozen(built.knownMuscleGroups())).toBe(true);
    expect(Object.isFrozen(built.list())).toBe(true);
    expect(Object.isFrozen(built.list()[0])).toBe(true);
    expect(Object.isFrozen(built.keysForMuscleGroup('chest'))).toBe(true);
  });
});
