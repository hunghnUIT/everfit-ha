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
  'Required. An RFC 3339 date-time with Z or a UTC offset (some ISO 8601 ' +
  'variants are tolerated), from 1900-01-01T00:00:00Z to ' +
  '9999-12-31T23:59:59.999Z. Each period is half-open: its start is ' +
  'included, its end is not. The periods may overlap.';

// The query of GET …/personal-records/compare (design §9.4). class-validator
// checks presence and types; readCompareQuery reads the dates and the unit.
// All four bounds are required, and each missing one gets its own message:
// @IsDefined is checked before the others. A property's rules run bottom-up,
// so the type check is written last: a repeated parameter is said to be sent
// twice.
export class CompareQueryDto extends QueryDto {
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

  @ApiProperty({
    description: `The start of the current period, included. ${BOUND_DESCRIPTION}`,
    example: '2025-02-01T00:00:00Z',
  })
  @IsDefined({
    message:
      'from is required: the start of the current period, included, for example from=2025-02-01T00:00:00Z.',
  })
  @IsNotEmpty()
  @IsString()
  from: string;

  @ApiProperty({
    description: `The end of the current period, excluded. ${BOUND_DESCRIPTION}`,
    example: '2025-03-01T00:00:00Z',
  })
  @IsDefined({
    message:
      'to is required: the end of the current period, excluded, for example to=2025-03-01T00:00:00Z.',
  })
  @IsNotEmpty()
  @IsString()
  to: string;

  @ApiProperty({
    description: `The start of the comparison period, included. ${BOUND_DESCRIPTION}`,
    example: '2025-01-01T00:00:00Z',
  })
  @IsDefined({
    message:
      'compareFrom is required: the start of the comparison period, included, for example compareFrom=2025-01-01T00:00:00Z.',
  })
  @IsNotEmpty()
  @IsString()
  compareFrom: string;

  @ApiProperty({
    description: `The end of the comparison period, excluded. ${BOUND_DESCRIPTION}`,
    example: '2025-02-01T00:00:00Z',
  })
  @IsDefined({
    message:
      'compareTo is required: the end of the comparison period, excluded, for example compareTo=2025-02-01T00:00:00Z.',
  })
  @IsNotEmpty()
  @IsString()
  compareTo: string;

  @ApiPropertyOptional({
    description: `The unit the records and absolute deltas are shown in, case-insensitive: ${SHARED_UNIT_REGISTRY.describe()}. Default kg.`,
    example: 'lb',
  })
  @IsOptional()
  @IsSupportedUnit()
  @IsNotEmpty()
  @IsString()
  unit?: string;
}
