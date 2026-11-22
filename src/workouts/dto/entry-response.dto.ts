import { ApiProperty } from '@nestjs/swagger';
import { PageDto } from '../../common/api-docs';
import { UNIT_CODES } from '../../units/dto/unit-response.dto';
import { DATE_DESCRIPTION, UTC_OFFSET_DESCRIPTION } from './entry-input.dto';

// OpenAPI-only descriptions of what the entry routes send (design §6, §9.1).
// On output unit is an enum of the canonical codes; on input it is a free
// string (SetInputDto), because an input enum would tell a generated client
// that "lbs" is invalid when it is not.

export class OriginalWeightDto {
  @ApiProperty({
    example: 225,
    description: 'The number as sent, up to three decimals.',
  })
  weight: number;

  @ApiProperty({
    enum: UNIT_CODES,
    example: 'lb',
    description: 'The canonical code: "lbs" is sent back as "lb".',
  })
  unit: string;
}

export class SetResponseDto {
  @ApiProperty({ example: 1, description: '1-based, in the order sent.' })
  setNumber: number;

  @ApiProperty({ example: 5 })
  reps: number;

  @ApiProperty({
    example: 102.06,
    description:
      'In the requested unit, rounded half-up to two decimals. When the ' +
      "requested unit is the set's own, the number as sent.",
  })
  weight: number;

  @ApiProperty({ enum: UNIT_CODES, example: 'kg' })
  unit: string;

  @ApiProperty({ type: OriginalWeightDto })
  original: OriginalWeightDto;
}

export class EntryResponseDto {
  @ApiProperty({ example: '0194f2fe-6c3a-7b1d-9a2e-4f5d6c7b8a90' })
  id: string;

  @ApiProperty({ example: 'u_123' })
  userId: string;

  @ApiProperty({ example: 'Bench Press', description: 'As entered, trimmed.' })
  exerciseName: string;

  @ApiProperty({
    example: 'bench press',
    description:
      'The normalised name: NFKC, trimmed, spaces collapsed, lower case.',
  })
  exerciseKey: string;

  @ApiProperty({
    type: [String],
    example: ['chest', 'shoulders', 'triceps'],
    description:
      'From the catalog, by key, at read time. Empty when the exercise is not in the catalog.',
  })
  muscleGroups: string[];

  @ApiProperty({
    description: DATE_DESCRIPTION,
    example: '2025-02-09T22:30:00.000Z',
  })
  date: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '+07:00',
    description: UTC_OFFSET_DESCRIPTION,
  })
  utcOffset: string | null;

  @ApiProperty({ type: [SetResponseDto] })
  sets: SetResponseDto[];

  @ApiProperty({ example: '2025-02-11T03:12:45.120Z' })
  createdAt: string;
}

export class EntryEnvelopeDto {
  @ApiProperty({ type: EntryResponseDto })
  data: EntryResponseDto;
}

export class BulkEntriesEnvelopeDto {
  @ApiProperty({
    type: [EntryResponseDto],
    description: 'In the order sent. History lists them newest first.',
  })
  data: EntryResponseDto[];
}

export class HistoryEnvelopeDto {
  @ApiProperty({ type: [EntryResponseDto] })
  data: EntryResponseDto[];

  @ApiProperty({ type: PageDto })
  page: PageDto;

  @ApiProperty({
    required: false,
    example: 'No workout entries found for the given filters.',
    description: 'Present when data is empty, which is a 200, not an error.',
  })
  message?: string;
}
