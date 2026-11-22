import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDefined, IsString } from 'class-validator';
import { MAX_GROUPS_PER_EXERCISE, MAX_NAME_LENGTH } from '../../common/limits';

// The body of POST /admin/exercises and PUT /admin/exercises/{exerciseKey}
// (design §10.5). Only presence, types and the lower bound: the name rule
// (lengths after normalising), the upper bound on groups (counted after
// de-duplication, as the seed counts it) and the closed list are checked by
// readExerciseWrite and the write's transaction. A property's rules run
// bottom-up, so the type check is written last to report first.
export class ExerciseWriteDto {
  @ApiProperty({
    example: 'Bench Press',
    maxLength: MAX_NAME_LENGTH,
    description:
      'The display name, stored trimmed with inner spaces collapsed. The ' +
      'key is computed from it (NFKC, trimmed, spaces collapsed, lower ' +
      'case) and never sent. On PUT its key must be the one in the path.',
  })
  @IsDefined()
  @IsString()
  name: string;

  @ApiProperty({
    type: [String],
    example: ['chest', 'shoulders', 'triceps'],
    minItems: 1,
    maxItems: MAX_GROUPS_PER_EXERCISE,
    description:
      'Primary mover first. Each name is normalised, repeats are removed, ' +
      'and each must be a known muscle group (GET /v1/muscle-groups).',
  })
  @IsDefined()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @IsArray()
  muscleGroups: string[];
}
