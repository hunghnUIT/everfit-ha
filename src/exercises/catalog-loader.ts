import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../database/tokens';
import { CatalogRows } from './catalog-snapshot';

export interface CatalogLoader {
  load(): Promise<CatalogRows>;
}

// The whole catalog in one statement (the V-20 shape), so it reads one
// consistent state of the tables without a transaction (design §10.2): every
// exercise with its groups in position order, and every group, including one
// no exercise uses. Keys and names sort by code point (COLLATE "C"), the same
// whatever the database's locale.
@Injectable()
export class PgCatalogLoader implements CatalogLoader {
  constructor(@Inject(DB) private readonly db: Database) {}

  async load(): Promise<CatalogRows> {
    const result = await this.db.execute<CatalogRows>(sql`
      SELECT
        coalesce(
          (SELECT json_agg(
                    json_build_object(
                      'key', e.exercise_key,
                      'name', e.name,
                      'muscleGroups', coalesce(
                        (SELECT json_agg(l.muscle_group ORDER BY l.position)
                           FROM exercise_muscle_groups l
                          WHERE l.exercise_key = e.exercise_key),
                        '[]'::json))
                    ORDER BY e.exercise_key COLLATE "C")
             FROM exercises e),
          '[]'::json) AS exercises,
        coalesce(
          (SELECT json_agg(g.name ORDER BY g.name COLLATE "C")
             FROM muscle_groups g),
          '[]'::json) AS groups
    `);
    const [row] = result.rows;
    return { exercises: row.exercises, groups: row.groups };
  }
}
