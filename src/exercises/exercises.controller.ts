import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProblems } from '../common/api-docs';
import { ApiProblem } from '../common/problem';
import { CatalogExerciseRow, CatalogRepository } from './catalog.repository';
import {
  CatalogExerciseEnvelopeDto,
  CatalogExercisesEnvelopeDto,
  MuscleGroupsEnvelopeDto,
} from './dto/catalog-response.dto';
import { exerciseKey } from './exercise-key';
import { hasNul } from './name-rules';

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
@Controller('v1')
export class ExercisesController {
  constructor(private readonly repository: CatalogRepository) {}

  @Get('exercises')
  @ApiOperation({
    summary: 'The catalog: every exercise with its muscle groups',
  })
  @ApiOkResponse({
    description: 'Every exercise, ordered by key. Not paginated.',
    type: CatalogExercisesEnvelopeDto,
  })
  async list() {
    const rows = await this.repository.listExercises();
    return { data: rows.map(toBody) };
  }

  // The path value arrives URL-decoded and goes through the key function, so
  // "Bench%20Press" and "bench%20press" are the same resource (§10.1). A key
  // with NUL cannot be stored, so it is not found without a query.
  @Get('exercises/:exerciseKey')
  @ApiOperation({ summary: 'One catalog exercise' })
  @ApiOkResponse({
    description: 'The exercise.',
    type: CatalogExerciseEnvelopeDto,
  })
  @ApiProblems(404)
  async findOne(@Param('exerciseKey') value: string) {
    const key = exerciseKey(value);
    const row = hasNul(key)
      ? undefined
      : await this.repository.findExercise(key);
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
  @ApiOkResponse({
    description: 'Every group with the number of exercises that list it.',
    type: MuscleGroupsEnvelopeDto,
  })
  async listMuscleGroups() {
    return { data: await this.repository.listMuscleGroups() };
  }
}
