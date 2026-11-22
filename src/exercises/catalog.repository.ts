import { Inject, Injectable } from '@nestjs/common';
import { count, eq, sql } from 'drizzle-orm';
import {
  exerciseMuscleGroups,
  exercises,
  muscleGroups,
} from '../database/schema';
import { DB, type Database } from '../database/tokens';
import { CatalogExercise } from './catalog-snapshot';

export type CatalogExerciseRow = CatalogExercise & {
  createdAt: Date;
  updatedAt: Date;
};

// The catalog's own GET routes read the tables on every request, never the
// snapshot, so an admin checking a change sees the database (design §10.4).
// Keys and names sort by code point (COLLATE "C"), whatever the locale.
@Injectable()
export class CatalogRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  listExercises(): Promise<CatalogExerciseRow[]> {
    return this.selectExercises().orderBy(
      sql`${exercises.exerciseKey} COLLATE "C"`,
    );
  }

  async findExercise(key: string): Promise<CatalogExerciseRow | null> {
    const [row] = await this.selectExercises().where(
      eq(exercises.exerciseKey, key),
    );
    return row ?? null;
  }

  listMuscleGroups(): Promise<{ name: string; exerciseCount: number }[]> {
    return this.db
      .select({
        name: muscleGroups.name,
        exerciseCount: count(exerciseMuscleGroups.exerciseKey),
      })
      .from(muscleGroups)
      .leftJoin(
        exerciseMuscleGroups,
        eq(exerciseMuscleGroups.muscleGroup, muscleGroups.name),
      )
      .groupBy(muscleGroups.name)
      .orderBy(sql`${muscleGroups.name} COLLATE "C"`);
  }

  // Each exercise with its groups in position order, primary mover first. The
  // outer column is written out: inside a select field Drizzle renders a
  // column unqualified, and the subquery would compare l with itself.
  private selectExercises() {
    return this.db
      .select({
        key: exercises.exerciseKey,
        name: exercises.name,
        muscleGroups: sql<string[]>`coalesce(
          (SELECT json_agg(l.muscle_group ORDER BY l.position)
             FROM exercise_muscle_groups l
            WHERE l.exercise_key = exercises.exercise_key),
          '[]'::json)`,
        createdAt: exercises.createdAt,
        updatedAt: exercises.updatedAt,
      })
      .from(exercises)
      .$dynamic();
  }
}
