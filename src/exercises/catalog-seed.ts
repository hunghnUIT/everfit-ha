import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import get from 'lodash/get';
import isPlainObject from 'lodash/isPlainObject';
import partition from 'lodash/partition';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PoolClient } from 'pg';
import { MAX_GROUPS_PER_EXERCISE } from '../common/limits';
import { Check, FieldError } from '../common/problem';
import { toFieldErrors } from '../common/validation';
import { CATALOG_WRITE_LOCK } from '../database/locks';
import {
  catalogSeedLedger,
  exerciseMuscleGroups,
  exercises,
  muscleGroups,
} from '../database/schema';
import { SeedFileDto } from './dto/seed-file.dto';
import { checkExerciseName, checkMuscleGroupName } from './name-rules';

// The catalog seed (design §10.3): each item of the file is given to a
// database once, so an admin's later edit or delete is never undone. It runs
// only inside the migrate step, never in api (§13).

// Two folders above this file is the application root, from src/exercises
// under ts-jest and from dist/exercises in the image. The file lies outside
// src/, so it is not a Nest asset: the Dockerfile copies it.
export const DEFAULT_SEED_PATH = join(
  __dirname,
  '..',
  '..',
  'seed',
  'exercise-catalog.seed.json',
);

// Normalised values: group names as muscleGroupName() makes them, and each
// exercise's key as exerciseKey(name) makes it.
export type SeedFile = {
  muscleGroups: string[];
  exercises: { name: string; key: string; muscleGroups: string[] }[];
};

export type SeedPlan = {
  groups: string[];
  exercises: SeedFile['exercises'];
  warnings: string[];
};

// A file that cannot be read or fails validation. The message carries every
// item path, so the migrate step's one log line names what to fix.
export class SeedFileError extends Error {
  constructor(
    readonly file: string,
    readonly errors: FieldError[],
  ) {
    super(
      `The seed file ${file} is invalid: ${errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}`,
    );
    this.name = 'SeedFileError';
  }
}

const FILE_PATH = '(file)';

// The file's shape first, through class-validator; then the admin routes'
// field rules on every name, the group list and the duplicates.
export function validateSeedFile(json: unknown): Check<SeedFile> {
  if (!isPlainObject(json)) {
    return {
      ok: false,
      errors: [
        { path: FILE_PATH, message: 'The seed file must be a JSON object.' },
      ],
    };
  }
  const dto = plainToInstance(SeedFileDto, json);
  const shapeErrors = toFieldErrors(validateSync(dto));
  if (shapeErrors.length > 0) return { ok: false, errors: shapeErrors };

  const errors: FieldError[] = [];

  // Group name → its index in the file, for the duplicate message.
  const groupIndex = new Map<string, number>();
  dto.muscleGroups.forEach((raw, i) => {
    const path = `muscleGroups[${i}]`;
    const group = checkMuscleGroupName(raw, path);
    if (!group.ok) {
      errors.push(...group.errors);
      return;
    }
    const first = groupIndex.get(group.value);
    if (first === undefined) groupIndex.set(group.value, i);
    else {
      errors.push({
        path,
        message: `The muscle group "${group.value}" is already listed at muscleGroups[${first}].`,
      });
    }
  });

  const keyIndex = new Map<string, number>();
  const items: SeedFile['exercises'] = [];
  dto.exercises.forEach((item, i) => {
    const prefix = `exercises[${i}]`;
    const name = checkExerciseName(item.name, `${prefix}.name`);
    if (!name.ok) errors.push(...name.errors);
    else {
      const first = keyIndex.get(name.value.key);
      if (first === undefined) keyIndex.set(name.value.key, i);
      else {
        errors.push({
          path: `${prefix}.name`,
          message: `The name has the key "${name.value.key}", the same as exercises[${first}].name.`,
        });
      }
    }

    const groups: string[] = [];
    item.muscleGroups.forEach((raw, k) => {
      const path = `${prefix}.muscleGroups[${k}]`;
      const group = checkMuscleGroupName(raw, path);
      if (!group.ok) errors.push(...group.errors);
      else if (!groupIndex.has(group.value)) {
        errors.push({
          path,
          message: `The muscle group "${group.value}" is not in the file's muscleGroups.`,
        });
      } else groups.push(group.value);
    });
    // De-duplicated after normalising, as on an exercise write (§10.1).
    const unique = [...new Set(groups)];
    if (unique.length > MAX_GROUPS_PER_EXERCISE) {
      errors.push({
        path: `${prefix}.muscleGroups`,
        message: `An exercise has at most ${MAX_GROUPS_PER_EXERCISE} muscle groups; this one has ${unique.length}.`,
      });
    }
    if (name.ok) items.push({ ...name.value, muscleGroups: unique });
  });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { muscleGroups: [...groupIndex.keys()], exercises: items },
  };
}

// Reads and validates the file; throws SeedFileError naming every item.
export function readSeedFile(file: string): SeedFile {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new SeedFileError(file, [
      {
        path: FILE_PATH,
        message: `cannot be read as JSON: ${String(get(error, 'message'))}`,
      },
    ]);
  }
  const result = validateSeedFile(json);
  if (!result.ok) throw new SeedFileError(file, result.errors);
  return result.value;
}

// Pure: which file items this database has not been given yet. An item in
// the ledger is never looked at again. Existing exercise keys are not an
// input: runSeed's INSERT … ON CONFLICT DO NOTHING covers an exercise an
// admin created first, and writes no links for it.
export function planSeed(
  file: SeedFile,
  ledger: { exercises: ReadonlySet<string>; groups: ReadonlySet<string> },
  existingGroups: ReadonlySet<string>,
): SeedPlan {
  const groups = file.muscleGroups.filter((g) => !ledger.groups.has(g));
  // A group an admin deleted after an earlier seed is in the ledger and not
  // in the table, so it is neither planned nor available.
  const available = new Set([...existingGroups, ...groups]);
  const warnings: string[] = [];
  const planned: SeedFile['exercises'] = [];
  for (const item of file.exercises) {
    if (ledger.exercises.has(item.key)) continue;
    const [kept, missing] = partition(item.muscleGroups, (g) =>
      available.has(g),
    );
    if (kept.length === 0) {
      warnings.push(
        `Seed: "${item.name}" is skipped: none of its muscle groups (${missing.join(', ')}) exists. It is not recorded, so a later run inserts it once one does.`,
      );
      continue;
    }
    for (const group of missing) {
      warnings.push(
        `Seed: "${item.name}" is inserted without the muscle group "${group}", which no longer exists.`,
      );
    }
    planned.push({ ...item, muscleGroups: kept });
  }
  return { groups, exercises: planned, warnings };
}

// One transaction, which takes the catalog write lock before it reads the
// ledger, so a racing deploy or an admin write waits for it (§10.3, §10.5).
export async function runSeed(
  client: PoolClient,
  file: SeedFile,
  log: (line: string) => void,
): Promise<void> {
  const warnings = await drizzle(client).transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK})`);
    const ledgerRows = await tx.select().from(catalogSeedLedger);
    const groupRows = await tx
      .select({ name: muscleGroups.name })
      .from(muscleGroups);
    const keysOf = (kind: 'exercise' | 'muscle_group') =>
      new Set(ledgerRows.filter((r) => r.kind === kind).map((r) => r.itemKey));
    const plan = planSeed(
      file,
      { exercises: keysOf('exercise'), groups: keysOf('muscle_group') },
      new Set(groupRows.map((r) => r.name)),
    );

    if (plan.groups.length > 0) {
      await tx
        .insert(muscleGroups)
        .values(plan.groups.map((name) => ({ name })))
        .onConflictDoNothing();
    }
    for (const item of plan.exercises) {
      const inserted = await tx
        .insert(exercises)
        .values({ exerciseKey: item.key, name: item.name })
        .onConflictDoNothing()
        .returning({ key: exercises.exerciseKey });
      // No row back: an admin created it first, and its groups stay as written.
      if (inserted.length === 0) continue;
      await tx.insert(exerciseMuscleGroups).values(
        item.muscleGroups.map((muscleGroup, position) => ({
          exerciseKey: item.key,
          muscleGroup,
          position,
        })),
      );
    }

    const recorded = [
      ...plan.groups.map((itemKey) => ({
        kind: 'muscle_group' as const,
        itemKey,
      })),
      ...plan.exercises.map((e) => ({
        kind: 'exercise' as const,
        itemKey: e.key,
      })),
    ];
    if (recorded.length > 0) {
      await tx.insert(catalogSeedLedger).values(recorded).onConflictDoNothing();
    }
    return plan.warnings;
  });
  for (const line of warnings) log(line);
}
