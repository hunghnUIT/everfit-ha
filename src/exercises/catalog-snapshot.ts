// One exercise of the catalog: its key, its display name, and its muscle
// groups in position order, primary mover first.
export type CatalogExercise = {
  key: string;
  name: string;
  muscleGroups: readonly string[];
};

// What one catalog load returns: every exercise, and every group, including a
// group no exercise uses yet.
export type CatalogRows = { exercises: CatalogExercise[]; groups: string[] };

const NO_KEYS: readonly string[] = Object.freeze([]);

// The whole catalog as of one load (design §10.2). Built completely, then
// never changed: a request takes one snapshot and uses it for every lookup,
// so a response never mixes two loads. Every lookup is synchronous.
export class CatalogSnapshot {
  private readonly exercises: readonly CatalogExercise[];
  private readonly groups: readonly string[];
  private readonly groupSet: ReadonlySet<string>;
  private readonly byKey: ReadonlyMap<string, CatalogExercise>;
  private readonly byGroup: ReadonlyMap<string, readonly string[]>;

  constructor(
    rows: CatalogRows,
    readonly loadNumber: number,
  ) {
    // Copied and frozen, so neither the caller's rows nor a returned array
    // can change the snapshot afterwards.
    this.exercises = Object.freeze(
      rows.exercises.map((exercise) =>
        Object.freeze({
          key: exercise.key,
          name: exercise.name,
          muscleGroups: Object.freeze([...exercise.muscleGroups]),
        }),
      ),
    );
    this.groups = Object.freeze([...new Set(rows.groups)].toSorted());
    this.groupSet = new Set(this.groups);
    this.byKey = new Map(this.exercises.map((e) => [e.key, e]));

    const byGroup = new Map<string, string[]>();
    for (const exercise of this.exercises) {
      for (const group of exercise.muscleGroups) {
        const keys = byGroup.get(group) ?? [];
        keys.push(exercise.key);
        byGroup.set(group, keys);
      }
    }
    this.byGroup = new Map(
      [...byGroup].map(([group, keys]) => [group, Object.freeze(keys)]),
    );
  }

  // [] for a key the catalog does not hold: an unknown exercise is loggable
  // and shows no groups (design §10.1).
  muscleGroupsFor(key: string): readonly string[] {
    return this.byKey.get(key)?.muscleGroups ?? NO_KEYS;
  }

  keysForMuscleGroup(group: string): readonly string[] {
    return this.byGroup.get(group) ?? NO_KEYS;
  }

  knownMuscleGroups(): readonly string[] {
    return this.groups;
  }

  hasMuscleGroup(group: string): boolean {
    return this.groupSet.has(group);
  }

  list(): readonly CatalogExercise[] {
    return this.exercises;
  }
}
