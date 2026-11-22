import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_BULK,
  MAX_NAME_LENGTH,
  MAX_REPS,
  MAX_SETS,
  MAX_WEIGHT,
  MAX_WEIGHT_DECIMALS,
} from '../../common/limits';
import { SHARED_UNIT_REGISTRY } from '../../units/unit-registry';

// The request bodies of design §9.1. These classes own presence, types,
// numeric ranges, array sizes and unknown properties; readEntryInputs runs
// the domain checks (date, name, decimal places, unit, userId) on top.
// class-validator runs a property's rules bottom-up and, with
// stopAtFirstError, reports the first that fails: the type check is written
// last, so "225" is called not a number rather than out of range.

const SET_EXAMPLE = '{ "reps": 5, "weight": 100, "unit": "kg" }';
const ENTRY_EXAMPLE =
  '{ "date": "2025-02-10T05:30:00+07:00", "exerciseName": "Bench Press", ' +
  `"sets": [${SET_EXAMPLE}] }`;

// The messages that show the expected shape (§9.1, Review Focus 3).
export const SHAPE_MESSAGES = {
  singleBody:
    `The body must be one entry object, for example ${ENTRY_EXAMPLE}. ` +
    'To log several entries, send { "entries": [ … ] } to ' +
    '/workout-entries/bulk.',
  bulkBody:
    'The body must be an object with an entries array, for example ' +
    `{ "entries": [${ENTRY_EXAMPLE}] }.`,
  entries: `entries must be an array of 1 to ${MAX_BULK} entries, for example [${ENTRY_EXAMPLE}].`,
  entry: `Each entry must be an object, for example ${ENTRY_EXAMPLE}.`,
  sets: `sets must be an array of 1 to ${MAX_SETS} sets, for example [${SET_EXAMPLE}].`,
  set: `Each set must be an object, for example ${SET_EXAMPLE}.`,
} as const;

// OpenAPI texts (§9.1). The response's date and utcOffset (Task 10b) use the
// same two.
export const DATE_DESCRIPTION =
  'An instant: an RFC 3339 date-time with Z or a UTC offset (some ISO 8601 ' +
  'variants are tolerated). It names a moment, to be shown in a time zone; ' +
  'its first ten characters are not a local date.';
export const UTC_OFFSET_DESCRIPTION =
  'The UTC offset the date was written with, for display only. null when ' +
  'the client sent Z.';

export class SetInputDto {
  @ApiProperty({ minimum: 1, maximum: MAX_REPS, example: 5 })
  @IsDefined()
  @Max(MAX_REPS)
  @Min(1)
  @IsInt()
  reps: number;

  @ApiProperty({
    minimum: 0,
    maximum: MAX_WEIGHT,
    example: 100,
    description: `At most ${MAX_WEIGHT_DECIMALS} decimal places. 0 is a bodyweight set.`,
  })
  @IsDefined()
  @Max(MAX_WEIGHT)
  @Min(0)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  weight: number;

  @ApiProperty({
    example: 'kg',
    description: `A unit code or alias, case-insensitive: ${SHARED_UNIT_REGISTRY.describe()}.`,
  })
  @IsDefined()
  @IsString()
  unit: string;
}

export class EntryInputDto {
  @ApiProperty({
    description: DATE_DESCRIPTION,
    example: '2025-02-10T05:30:00+07:00',
  })
  @IsDefined()
  @IsString({
    message:
      'date must be a string holding an RFC 3339 date-time with a UTC ' +
      'offset, for example 2025-02-10T09:00:00+07:00.',
  })
  date: string;

  @ApiProperty({ maxLength: MAX_NAME_LENGTH, example: 'Bench Press' })
  @IsDefined()
  @IsString()
  exerciseName: string;

  @ApiProperty({ type: [SetInputDto], minItems: 1, maxItems: MAX_SETS })
  @IsDefined({ message: SHAPE_MESSAGES.sets })
  @ValidateNested({ each: true, message: SHAPE_MESSAGES.set })
  @ArrayMaxSize(MAX_SETS)
  @ArrayMinSize(1)
  @IsArray({ message: SHAPE_MESSAGES.sets })
  @Type(() => SetInputDto)
  sets: SetInputDto[];

  @ApiPropertyOptional({
    description: 'If sent, must equal the userId in the path.',
    example: 'u_123',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class BulkInputDto {
  @ApiProperty({ type: [EntryInputDto], minItems: 1, maxItems: MAX_BULK })
  @IsDefined({ message: SHAPE_MESSAGES.entries })
  @ValidateNested({ each: true, message: SHAPE_MESSAGES.entry })
  @ArrayMaxSize(MAX_BULK)
  @ArrayMinSize(1)
  @IsArray({ message: SHAPE_MESSAGES.entries })
  @Type(() => EntryInputDto)
  entries: EntryInputDto[];
}
