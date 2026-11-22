import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblems } from '../common/api-docs';
import type { Response } from 'express';
import { CatalogService } from './catalog.service';
import {
  CatalogExerciseEnvelopeDto,
  MuscleGroupCreatedEnvelopeDto,
} from './dto/catalog-response.dto';
import { ExerciseWriteDto } from './dto/exercise-write.dto';
import { MuscleGroupWriteDto } from './dto/muscle-group-write.dto';

// Every operation says the routes are open (design §10.7, item 3).
const OPEN =
  'UNAUTHENTICATED in v1: anyone who can reach the API can call this route ' +
  'and change the catalog for every user. Logged entries and PRs are never ' +
  'changed by it. The README, "Catalog administration", shows the two lines ' +
  'that switch the admin token guard on.';

// The catalog's write routes (design §10.5), and only those, so the two
// commented lines below cover exactly them (§10.7). HTTP only: the rules and
// the transaction are CatalogService's.
// import { AdminOnly } from '../common/admin-token.guard';   // ← 1. uncomment
@ApiTags('Admin — catalog (UNAUTHENTICATED)')
@Controller('admin')
// @AdminOnly()                                               // ← 2. uncomment, and set ADMIN_API_TOKEN
export class CatalogAdminController {
  constructor(private readonly service: CatalogService) {}

  // Location encodes the key: "90/90 hip stretch" is created at
  // /v1/exercises/90%2F90%20hip%20stretch (§10.5).
  @Post('exercises')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add an exercise to the catalog',
    description: OPEN,
  })
  @ApiCreatedResponse({
    description:
      'The exercise. Location is its URL, with the key percent-encoded.',
    type: CatalogExerciseEnvelopeDto,
    headers: {
      Location: {
        description: 'The URL of the new exercise.',
        schema: { type: 'string', example: '/v1/exercises/bench%20press' },
      },
    },
  })
  @ApiProblems(400, 409, 413, 415)
  async createExercise(
    @Body() body: ExerciseWriteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.service.createExercise(body);
    res.location(`/v1/exercises/${encodeURIComponent(data.key)}`);
    return { data };
  }

  // The path value arrives URL-decoded and goes through the key function.
  @Put('exercises/:exerciseKey')
  @ApiOperation({
    summary: "Replace an exercise's name spelling and muscle groups",
    description: OPEN,
  })
  @ApiOkResponse({
    description: 'The exercise as now stored.',
    type: CatalogExerciseEnvelopeDto,
  })
  @ApiProblems(400, 404, 413, 415)
  async replaceExercise(
    @Param('exerciseKey') exerciseKey: string,
    @Body() body: ExerciseWriteDto,
  ) {
    return { data: await this.service.replaceExercise(exerciseKey, body) };
  }

  @Delete('exercises/:exerciseKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove an exercise from the catalog; its logged entries stay',
    description: OPEN,
  })
  @ApiNoContentResponse({ description: 'Removed.' })
  @ApiProblems(404)
  async deleteExercise(@Param('exerciseKey') exerciseKey: string) {
    await this.service.deleteExercise(exerciseKey);
  }

  @Post('muscle-groups')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a muscle group to the closed list',
    description: OPEN,
  })
  @ApiCreatedResponse({
    description: 'The group.',
    type: MuscleGroupCreatedEnvelopeDto,
  })
  @ApiProblems(400, 409, 413, 415)
  async createMuscleGroup(@Body() body: MuscleGroupWriteDto) {
    return { data: await this.service.createMuscleGroup(body) };
  }

  @Delete('muscle-groups/:name')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a muscle group that no exercise lists',
    description: OPEN,
  })
  @ApiNoContentResponse({ description: 'Removed.' })
  @ApiProblems(404, 409)
  async deleteMuscleGroup(@Param('name') name: string) {
    await this.service.deleteMuscleGroup(name);
  }
}
