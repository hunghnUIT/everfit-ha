import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString } from 'class-validator';

// The body of POST /admin/muscle-groups (design §10.5). Presence and type
// only; the name rule (blank, length after normalising, characters) is
// checkMuscleGroupName's. The type check is written last to report first.
export class MuscleGroupWriteDto {
  @ApiProperty({
    example: 'forearms',
    description:
      'The group name, stored trimmed with inner spaces collapsed and in ' +
      'lower case (the same rule as the names in an exercise body).',
  })
  @IsDefined()
  @IsString()
  name: string;
}
