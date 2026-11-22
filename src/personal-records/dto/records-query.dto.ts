import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MAX_NAME_LENGTH } from '../../common/limits';
import { QueryDto } from '../../common/query-dto';
import { IsSupportedUnit } from '../../units/is-supported-unit';
import { SHARED_UNIT_REGISTRY } from '../../units/unit-registry';

const BOUND_DESCRIPTION =
  'An RFC 3339 date-time with Z or a UTC offset (some ISO 8601 variants are ' +
  'tolerated), not before 1900-01-01T00:00:00Z. The range is half-open: ' +
  'from is included, to is not. Each bound is usable alone.';

// The query of GET …/personal-records (design §9.3). class-validator checks
// presence and types; readRecordsQuery reads the dates and the unit. A
// property's rules run bottom-up, so the type check is written last: a
// repeated parameter (an array) is said to be sent twice. @IsDefined is
// checked before the others, so a missing exercise gets its own message.
export class RecordsQueryDto extends QueryDto {
  @ApiProperty({
    description:
      'The whole exercise name, matched after normalisation (case and ' +
      'spacing do not matter). bench does not find Bench Press here; the ' +
      'history filter finds names that contain a term.',
    maxLength: MAX_NAME_LENGTH,
    example: 'Bench Press',
  })
  @IsDefined({
    message:
      'exercise is required: send the whole exercise name, for example exercise=Bench%20Press.',
  })
  @MaxLength(MAX_NAME_LENGTH)
  @IsNotEmpty()
  @IsString()
  exercise: string;

  @ApiPropertyOptional({
    description: `The start of the range, included. ${BOUND_DESCRIPTION}`,
    example: '2025-01-31T17:00:00Z',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    description: `The end of the range, excluded. ${BOUND_DESCRIPTION}`,
    example: '2025-02-28T17:00:00Z',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  to?: string;

  @ApiPropertyOptional({
    description: `The unit the records are shown in, case-insensitive: ${SHARED_UNIT_REGISTRY.describe()}. Default kg.`,
    example: 'lb',
  })
  @IsOptional()
  @IsSupportedUnit()
  @IsNotEmpty()
  @IsString()
  unit?: string;
}
