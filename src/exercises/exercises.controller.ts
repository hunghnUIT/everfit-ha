import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblem } from '../common/problem';
import { CatalogExerciseRow, CatalogRepository } from './catalog.repository';
import { exerciseKey } from './exercise-key';

function toBody(row: CatalogExerciseRow) {
  return {
    key: row.key,
    name: row.name,
    muscleGroups: row.muscleGroups,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// The public catalog routes (design §10.4). They read the tables, not the
// snapshot, and take no query parameters.
@ApiTags('catalog')
@Controller()
export class ExercisesController {
  constructor(private readonly repository: CatalogRepository) {}

  @Get('exercises')
  @ApiOperation({
    summary: 'The catalog: every exercise with its muscle groups',
  })
  async list() {
    const rows = await this.repository.listExercises();
    return { data: rows.map(toBody) };
  }

  // The path value arrives URL-decoded and goes through the key function, so
  // "Bench%20Press" and "bench%20press" are the same resource (§10.1).
  @Get('exercises/:exerciseKey')
  @ApiOperation({ summary: 'One catalog exercise' })
  async findOne(@Param('exerciseKey') value: string) {
    const key = exerciseKey(value);
    const row = await this.repository.findExercise(key);
    if (!row) {
      throw new ApiProblem(
        404,
        'NOT_FOUND',
        `No catalog exercise has the key "${key}".`,
      );
    }
    return { data: toBody(row) };
  }

  @Get('muscle-groups')
  @ApiOperation({ summary: 'The known muscle groups' })
  async listMuscleGroups() {
    return { data: await this.repository.listMuscleGroups() };
  }
}
