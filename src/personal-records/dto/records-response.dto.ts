import { ApiProperty } from '@nestjs/swagger';
import { UNIT_CODES } from '../../units/dto/unit-response.dto';
import {
  DATE_DESCRIPTION,
  UTC_OFFSET_DESCRIPTION,
} from '../../workouts/dto/entry-input.dto';
import { OriginalWeightDto } from '../../workouts/dto/entry-response.dto';

// OpenAPI-only descriptions of the records routes (design §9.3, §9.4).

export class RecordSetDto {
  @ApiProperty({
    example: 100,
    description:
      "In the requested unit; the number as sent when that is the set's own unit, otherwise rounded half-up to two decimals.",
  })
  weight: number;

  @ApiProperty({ example: 10 })
  reps: number;

  @ApiProperty({ enum: UNIT_CODES, example: 'kg' })
  unit: string;

  @ApiProperty({ type: OriginalWeightDto })
  original: OriginalWeightDto;

  @ApiProperty({
    description:
      DATE_DESCRIPTION + ' The moment the record was first achieved.',
    example: '2025-01-02T04:05:00.000Z',
  })
  date: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '+07:00',
    description: UTC_OFFSET_DESCRIPTION,
  })
  utcOffset: string | null;

  @ApiProperty({ example: '0194f2fe-6c3a-7b1d-9a2e-4f5d6c7b8a90' })
  entryId: string;

  @ApiProperty({ example: 3 })
  setNumber: number;
}

export class HighestVolumeSetDto extends RecordSetDto {
  @ApiProperty({
    example: 1000,
    description: 'reps × weight of the set, in the requested unit.',
  })
  volume: number;
}

export class BestEstimatedOneRepMaxDto extends RecordSetDto {
  @ApiProperty({
    example: 133.33,
    description:
      'An estimate, not a tested max: Epley, weight × (1 + reps / 30), for every rep count.',
  })
  estimatedOneRepMax: number;
}

export class RecordsDto {
  @ApiProperty({ type: RecordSetDto, nullable: true })
  heaviestSet: RecordSetDto | null;

  @ApiProperty({ type: HighestVolumeSetDto, nullable: true })
  highestVolumeSet: HighestVolumeSetDto | null;

  @ApiProperty({ type: BestEstimatedOneRepMaxDto, nullable: true })
  bestEstimatedOneRepMax: BestEstimatedOneRepMaxDto | null;
}

export class ExerciseKeyDto {
  @ApiProperty({ example: 'bench press' })
  key: string;
}

export class RecordsRangeDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '2025-01-31T17:00:00.000Z',
  })
  from: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2025-02-28T17:00:00.000Z',
  })
  to: string | null;
}

export class RecordsDataDto {
  @ApiProperty({ type: ExerciseKeyDto })
  exercise: ExerciseKeyDto;

  @ApiProperty({ enum: UNIT_CODES, example: 'kg' })
  unit: string;

  @ApiProperty({ type: RecordsRangeDto })
  range: RecordsRangeDto;

  @ApiProperty({ type: RecordsDto })
  records: RecordsDto;
}

export class RecordsEnvelopeDto {
  @ApiProperty({ type: RecordsDataDto })
  data: RecordsDataDto;

  @ApiProperty({
    required: false,
    example:
      "No entries found for exercise 'bench' in this range. This filter matches the whole exercise name; GET /v1/users/{userId}/workout-entries?exercise=bench lists the names that contain it.",
    description:
      'Present when nothing was found, which is a 200, not an error; all three records are then null.',
  })
  message?: string;
}

export class PeriodRangeDto {
  @ApiProperty({
    example: '2025-02-01T00:00:00.000Z',
    description: 'Included.',
  })
  from: string;

  @ApiProperty({
    example: '2025-03-01T00:00:00.000Z',
    description: 'Excluded.',
  })
  to: string;
}

export class PeriodDto {
  @ApiProperty({ type: PeriodRangeDto })
  range: PeriodRangeDto;

  @ApiProperty({ type: RecordsDto })
  records: RecordsDto;
}

export class DeltaDto {
  @ApiProperty({
    example: 5,
    description:
      'Current minus previous, in the requested unit. Computed from exact kilograms and rounded last, so it can differ by 0.01 from the difference of the two numbers shown.',
  })
  absolute: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.35,
    description: 'A plain number, no unit. null when the previous value is 0.',
  })
  percent: number | null;
}

export class DeltasDto {
  @ApiProperty({ type: DeltaDto, nullable: true })
  heaviestSet: DeltaDto | null;

  @ApiProperty({ type: DeltaDto, nullable: true })
  highestVolumeSet: DeltaDto | null;

  @ApiProperty({ type: DeltaDto, nullable: true })
  bestEstimatedOneRepMax: DeltaDto | null;
}

export class CompareDataDto {
  @ApiProperty({ type: ExerciseKeyDto })
  exercise: ExerciseKeyDto;

  @ApiProperty({ enum: UNIT_CODES, example: 'kg' })
  unit: string;

  @ApiProperty({ type: PeriodDto })
  current: PeriodDto;

  @ApiProperty({ type: PeriodDto })
  previous: PeriodDto;

  @ApiProperty({
    type: DeltasDto,
    description: 'Every delta is null when either period has no entries.',
  })
  delta: DeltasDto;
}

export class CompareEnvelopeDto {
  @ApiProperty({ type: CompareDataDto })
  data: CompareDataDto;

  @ApiProperty({
    required: false,
    description:
      'Present when a period is empty (a 200); names the empty period or periods and ends with the whole-name hint.',
  })
  message?: string;
}
