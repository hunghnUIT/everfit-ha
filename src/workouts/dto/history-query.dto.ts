import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DEFAULT_PAGE_SIZE,
  MAX_NAME_LENGTH,
  MAX_PAGE_SIZE,
} from '../../common/limits';
import { QueryDto } from '../../common/query-dto';
import { IsSupportedUnit } from '../../units/is-supported-unit';
import { SHARED_UNIT_REGISTRY } from '../../units/unit-registry';

const BOUND_DESCRIPTION =
  'An RFC 3339 date-time with Z or a UTC offset (some ISO 8601 variants are ' +
  'tolerated), not before 1900-01-01T00:00:00Z. The range is half-open: ' +
  'from is included, to is not. Each bound is usable alone.';

// The query of GET …/workout-entries (design §9.2). class-validator checks
// presence, types and ranges; readHistoryQuery checks what it cannot: the
// dates, the cursor and the muscle group against the catalog snapshot.
// A property's rules run bottom-up, so the type check is written last: a
// repeated parameter (an array) is said to be sent twice.
export class HistoryQueryDto extends QueryDto {
  @ApiPropertyOptional({
    description:
      'Part of the exercise name, case-insensitive; % and _ match themselves.',
    maxLength: MAX_NAME_LENGTH,
    example: 'bench',
  })
  @IsOptional()
  @MaxLength(MAX_NAME_LENGTH)
  @IsNotEmpty()
  @IsString()
  exercise?: string;

  @ApiPropertyOptional({
    description: 'A muscle group of the catalog (GET /v1/muscle-groups).',
    example: 'chest',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  muscleGroup?: string;

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
    description: `The unit the weights are shown in, case-insensitive: ${SHARED_UNIT_REGISTRY.describe()}. Default kg.`,
    example: 'lb',
  })
  @IsOptional()
  @IsSupportedUnit()
  @IsNotEmpty()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({
    description: `Entries per page, 1 to ${MAX_PAGE_SIZE}. Default ${DEFAULT_PAGE_SIZE}.`,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    type: Number,
  })
  @IsOptional()
  @Max(MAX_PAGE_SIZE)
  @Min(1)
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'The nextCursor of the previous page, sent unchanged. Leave it out for the first page.',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  cursor?: string;
}
