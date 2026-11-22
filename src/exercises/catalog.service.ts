import { Inject, Injectable, Logger } from '@nestjs/common';
import { count, eq, sql } from 'drizzle-orm';
import { MAX_GROUPS_PER_EXERCISE } from '../common/limits';
import {
  ApiProblem,
  Check,
  driverErrorCode,
  errorName,
  FieldError,
  validationProblem,
} from '../common/problem';
import { CATALOG_WRITE_LOCK } from '../database/locks';
import {
  exerciseMuscleGroups,
  exercises,
  muscleGroups,
} from '../database/schema';
import { DB, type Database, type Executor } from '../database/tokens';
import { ExerciseWriteDto } from './dto/exercise-write.dto';
import { MuscleGroupWriteDto } from './dto/muscle-group-write.dto';
import { EXERCISE_CATALOG, type ExerciseCatalog } from './exercise-catalog';
import {
  collapseWhitespace,
  exerciseKey,
  muscleGroupName,
} from './exercise-key';
import { checkExerciseName, checkMuscleGroupName, hasNul } from './name-rules';

// The catalog's writes (design §10.5, §10.6). Every write goes through
// withCatalogWrite: one transaction under the catalog write lock, then this
// replica's snapshot is reloaded before the response (§10.2).

// What the per-write log line names: the route as declared, and the key or
// group name it wrote.
export type CatalogWrite = { route: string; key: string };

export const EXERCISE_ROUTES = {
  create: 'POST /v1/admin/exercises',
  replace: 'PUT /v1/admin/exercises/:exerciseKey',
  delete: 'DELETE /v1/admin/exercises/:exerciseKey',
} as const;

export const MUSCLE_GROUP_ROUTES = {
  create: 'POST /v1/admin/muscle-groups',
  delete: 'DELETE /v1/admin/muscle-groups/:name',
} as const;

// The body of POST /v1/admin/muscle-groups: the stored name and its time.
export type MuscleGroupJson = { name: string; createdAt: string };

// The body of the exercise routes, as GET /v1/exercises shows an exercise.
export type ExerciseJson = {
  key: string;
  name: string;
  muscleGroups: string[];
  createdAt: string;
  updatedAt: string;
};

// A checked exercise body: the display name, its key, and each normalised
// group with the path of its first mention, in the order sent.
export type ExerciseWrite = {
  name: string;
  key: string;
  groups: Map<string, string>;
};

const FOREIGN_KEY_VIOLATION = '23503';

// Pure: the field rules of §10.5 on a body ExerciseWriteDto has shaped. The
// display name is the trimmed name with inner spaces collapsed, as the seed
// stores it; groups are normalised, then de-duplicated, then counted.
export function readExerciseWrite(
  body: ExerciseWriteDto,
): Check<ExerciseWrite> {
  const errors: FieldError[] = [];
  const name = checkExerciseName(body.name, 'name');
  if (!name.ok) errors.push(...name.errors);
  const groups = new Map<string, string>();
  body.muscleGroups.forEach((raw, i) => {
    const path = `muscleGroups[${i}]`;
    const group = checkMuscleGroupName(raw, path);
    if (!group.ok) errors.push(...group.errors);
    else if (!groups.has(group.value)) groups.set(group.value, path);
  });
  if (groups.size > MAX_GROUPS_PER_EXERCISE) {
    errors.push({
      path: 'muscleGroups',
      message: `An exercise has at most ${MAX_GROUPS_PER_EXERCISE} muscle groups; this one has ${groups.size}.`,
    });
  }
  if (!name.ok || errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: collapseWhitespace(name.value.name),
      key: name.value.key,
      groups,
    },
  };
}

function exerciseNotFound(key: string): ApiProblem {
  return new ApiProblem(
    404,
    'NOT_FOUND',
    `No catalog exercise has the key "${key}".`,
  );
}

function muscleGroupNotFound(name: string): ApiProblem {
  return new ApiProblem(
    404,
    'NOT_FOUND',
    `No muscle group is named "${name}".`,
  );
}

function toJson(
  write: ExerciseWrite,
  row: { createdAt: Date; updatedAt: Date },
): ExerciseJson {
  return {
    key: write.key,
    name: write.name,
    muscleGroups: [...write.groups.keys()],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(EXERCISE_CATALOG) private readonly catalog: ExerciseCatalog,
  ) {}

  // One catalog write. Its first statement takes the catalog write lock, so
  // writes (and a seed run) never interleave (§10.5). After the commit this
  // replica reloads its snapshot before responding; a failed reload is logged
  // by the catalog and retried there, and never changes the response, since
  // the write has committed. One log line per write: route, key, outcome.
  async withCatalogWrite<T>(
    write: CatalogWrite,
    fn: (tx: Executor) => Promise<T>,
  ): Promise<T> {
    let result: T;
    try {
      result = await this.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${CATALOG_WRITE_LOCK})`,
        );
        return fn(tx);
      });
    } catch (error) {
      const outcome = error instanceof ApiProblem ? error.code : 'failed';
      this.logger.log({ ...write, outcome }, 'Catalog write');
      throw error;
    }
    this.logger.log({ ...write, outcome: 'committed' }, 'Catalog write');
    try {
      await this.catalog.refresh();
    } catch (error) {
      // refresh() rejects only if logging its own failure threw. The class
      // name alone: a driver's message can name the database host.
      this.logger.error(
        { route: write.route, key: write.key, error: errorName(error) },
        'Catalog refresh after a committed write failed',
      );
    }
    return result;
  }

  // POST: INSERT … ON CONFLICT DO NOTHING RETURNING; no row back is the 409.
  async createExercise(body: ExerciseWriteDto): Promise<ExerciseJson> {
    const write = this.read(body);
    return this.withCatalogWrite(
      { route: EXERCISE_ROUTES.create, key: write.key },
      async (tx) => {
        await this.checkGroups(tx, write.groups);
        const [row] = await tx
          .insert(exercises)
          .values({ exerciseKey: write.key, name: write.name })
          .onConflictDoNothing()
          .returning({
            createdAt: exercises.createdAt,
            updatedAt: exercises.updatedAt,
          });
        if (row === undefined) {
          const [existing] = await tx
            .select({ name: exercises.name })
            .from(exercises)
            .where(eq(exercises.exerciseKey, write.key));
          throw new ApiProblem(
            409,
            'EXERCISE_EXISTS',
            `The catalog already has "${existing?.name ?? write.key}", whose key is "${write.key}". ` +
              `To change it, PUT /v1/admin/exercises/${encodeURIComponent(write.key)}.`,
          );
        }
        await this.insertLinks(tx, write);
        return toJson(write, row);
      },
    );
  }

  // PUT: a full replacement under a fixed key (§10.6). UPDATE … RETURNING;
  // no row back is the 404; then the links are replaced.
  async replaceExercise(
    pathValue: string,
    body: ExerciseWriteDto,
  ): Promise<ExerciseJson> {
    const key = exerciseKey(pathValue);
    // No stored key holds NUL, and PostgreSQL would refuse to bind it.
    if (hasNul(key)) throw exerciseNotFound(key);
    const write = this.read(body);
    if (write.key !== key) {
      throw validationProblem([
        {
          path: 'name',
          message:
            `The name "${write.name}" has the key "${write.key}", not "${key}": ` +
            'a different name is a different exercise. POST it as a new ' +
            `exercise, and DELETE "${key}" if it is no longer wanted.`,
        },
      ]);
    }
    return this.withCatalogWrite(
      { route: EXERCISE_ROUTES.replace, key },
      async (tx) => {
        await this.checkGroups(tx, write.groups);
        const [row] = await tx
          .update(exercises)
          .set({ name: write.name, updatedAt: sql`now()` })
          .where(eq(exercises.exerciseKey, key))
          .returning({
            createdAt: exercises.createdAt,
            updatedAt: exercises.updatedAt,
          });
        if (row === undefined) throw exerciseNotFound(key);
        await tx
          .delete(exerciseMuscleGroups)
          .where(eq(exerciseMuscleGroups.exerciseKey, key));
        await this.insertLinks(tx, write);
        return toJson(write, row);
      },
    );
  }

  // DELETE: the catalog row and its links (ON DELETE CASCADE), nothing else.
  // Logged entries keep their key and show no groups until it is POSTed
  // again (§10.6).
  async deleteExercise(pathValue: string): Promise<void> {
    const key = exerciseKey(pathValue);
    if (hasNul(key)) throw exerciseNotFound(key);
    await this.withCatalogWrite(
      { route: EXERCISE_ROUTES.delete, key },
      async (tx) => {
        const rows = await tx
          .delete(exercises)
          .where(eq(exercises.exerciseKey, key))
          .returning({ key: exercises.exerciseKey });
        if (rows.length === 0) throw exerciseNotFound(key);
      },
    );
  }

  // POST: the name rule is the one of every other write. INSERT … ON CONFLICT
  // DO NOTHING RETURNING; no row back is the 409.
  async createMuscleGroup(body: MuscleGroupWriteDto): Promise<MuscleGroupJson> {
    const checked = checkMuscleGroupName(body.name, 'name');
    if (!checked.ok) throw validationProblem(checked.errors);
    const name = checked.value;
    return this.withCatalogWrite(
      { route: MUSCLE_GROUP_ROUTES.create, key: name },
      async (tx) => {
        const [row] = await tx
          .insert(muscleGroups)
          .values({ name })
          .onConflictDoNothing()
          .returning({ createdAt: muscleGroups.createdAt });
        if (row === undefined) {
          throw new ApiProblem(
            409,
            'MUSCLE_GROUP_EXISTS',
            `The muscle group "${name}" already exists.`,
          );
        }
        return { name, createdAt: row.createdAt.toISOString() };
      },
    );
  }

  // DELETE: refused while an exercise lists the group. The exercises are
  // counted first, under the lock, because a 23503 aborts the transaction and
  // nothing could be read after it. The delete still runs in a savepoint: a
  // link added since the count by a writer that does not take the lock (SQL
  // typed by hand) is the same 409, from the foreign key (NO ACTION).
  async deleteMuscleGroup(pathValue: string): Promise<void> {
    const name = muscleGroupName(pathValue);
    if (hasNul(name)) throw muscleGroupNotFound(name);
    await this.withCatalogWrite(
      { route: MUSCLE_GROUP_ROUTES.delete, key: name },
      async (tx) => {
        const [group] = await tx
          .select({ name: muscleGroups.name })
          .from(muscleGroups)
          .where(eq(muscleGroups.name, name));
        if (group === undefined) throw muscleGroupNotFound(name);
        await this.refuseIfInUse(tx, name);
        try {
          await tx.transaction(async (savepoint) => {
            await savepoint
              .delete(muscleGroups)
              .where(eq(muscleGroups.name, name));
          });
        } catch (error) {
          if (driverErrorCode(error) === FOREIGN_KEY_VIOLATION) {
            await this.refuseIfInUse(tx, name);
          }
          throw error;
        }
      },
    );
  }

  private async refuseIfInUse(tx: Executor, name: string): Promise<void> {
    const [row] = await tx
      .select({ n: count() })
      .from(exerciseMuscleGroups)
      .where(eq(exerciseMuscleGroups.muscleGroup, name));
    const n = row?.n ?? 0;
    if (n > 0) {
      throw new ApiProblem(
        409,
        'MUSCLE_GROUP_IN_USE',
        `The muscle group "${name}" is still listed by ${n} ${n === 1 ? 'exercise' : 'exercises'}. ` +
          'Change or delete those exercises first.',
      );
    }
  }

  private read(body: ExerciseWriteDto): ExerciseWrite {
    const result = readExerciseWrite(body);
    if (!result.ok) throw validationProblem(result.errors);
    return result.value;
  }

  // The closed list (§10.5), checked against muscle_groups inside the write's
  // transaction, never against the snapshot: a group created a moment ago, on
  // this replica or another, is accepted at once. The 400 lists the table's
  // groups, by code point.
  private async checkGroups(
    tx: Executor,
    groups: ExerciseWrite['groups'],
  ): Promise<void> {
    const rows = await tx
      .select({ name: muscleGroups.name })
      .from(muscleGroups)
      .orderBy(sql`${muscleGroups.name} COLLATE "C"`);
    const known = rows.map((row) => row.name);
    const knownSet = new Set(known);
    const list = known.length > 0 ? known.join(', ') : 'none';
    const errors = [...groups]
      .filter(([group]) => !knownSet.has(group))
      .map(([group, path]) => ({
        path,
        message: `Unknown muscle group "${group}". Known muscle groups: ${list}.`,
      }));
    if (errors.length > 0) throw validationProblem(errors);
  }

  // The links in the order sent, primary mover first. Inside a savepoint, so
  // that after a 23503 (a group deleted since the check by a writer that does
  // not take the catalog lock, such as SQL typed by hand) the transaction can
  // still read the groups and answer the same 400 as the check.
  private async insertLinks(tx: Executor, write: ExerciseWrite): Promise<void> {
    const rows = [...write.groups.keys()].map((muscleGroup, position) => ({
      exerciseKey: write.key,
      muscleGroup,
      position,
    }));
    try {
      await tx.transaction(async (savepoint) => {
        await savepoint.insert(exerciseMuscleGroups).values(rows);
      });
    } catch (error) {
      if (driverErrorCode(error) === FOREIGN_KEY_VIOLATION) {
        await this.checkGroups(tx, write.groups);
      }
      throw error;
    }
  }
}
