import { ApiProperty } from '@nestjs/swagger';

// OpenAPI-only descriptions of the catalog routes (design §10.4, §10.5).

export class CatalogExerciseDto {
  @ApiProperty({ example: 'bench press', description: 'The normalised name.' })
  key: string;

  @ApiProperty({ example: 'Bench Press', description: 'The display spelling.' })
  name: string;

  @ApiProperty({
    type: [String],
    example: ['chest', 'shoulders', 'triceps'],
    description: 'Primary mover first.',
  })
  muscleGroups: string[];

  @ApiProperty({ example: '2025-02-11T03:12:45.120Z' })
  createdAt: string;

  @ApiProperty({ example: '2025-02-11T03:12:45.120Z' })
  updatedAt: string;
}

export class CatalogExerciseEnvelopeDto {
  @ApiProperty({ type: CatalogExerciseDto })
  data: CatalogExerciseDto;
}

export class CatalogExercisesEnvelopeDto {
  @ApiProperty({
    type: [CatalogExerciseDto],
    description: 'Ordered by key; not paginated.',
  })
  data: CatalogExerciseDto[];
}

export class MuscleGroupCountDto {
  @ApiProperty({ example: 'chest' })
  name: string;

  @ApiProperty({
    example: 12,
    description: 'How many exercises list the group.',
  })
  exerciseCount: number;
}

export class MuscleGroupsEnvelopeDto {
  @ApiProperty({ type: [MuscleGroupCountDto], description: 'Ordered by name.' })
  data: MuscleGroupCountDto[];
}

export class MuscleGroupCreatedDto {
  @ApiProperty({ example: 'forearms' })
  name: string;

  @ApiProperty({ example: '2025-02-11T03:12:45.120Z' })
  createdAt: string;
}

export class MuscleGroupCreatedEnvelopeDto {
  @ApiProperty({ type: MuscleGroupCreatedDto })
  data: MuscleGroupCreatedDto;
}
