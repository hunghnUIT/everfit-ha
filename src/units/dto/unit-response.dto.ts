import { ApiProperty } from '@nestjs/swagger';
import { SHARED_UNIT_REGISTRY } from '../unit-registry';

// OpenAPI-only (design §6): on output a unit is always a canonical code, so
// here it is an enum; on input it is a free string.
export const UNIT_CODES: string[] = SHARED_UNIT_REGISTRY.codes();

export class UnitDto {
  @ApiProperty({ enum: UNIT_CODES, example: 'lb' })
  code: string;

  @ApiProperty({ example: 'Pound' })
  label: string;

  @ApiProperty({
    type: [String],
    example: ['lbs'],
    description: 'Other spellings accepted on input, case-insensitive.',
  })
  aliases: string[];
}

export class UnitsEnvelopeDto {
  @ApiProperty({ type: [UnitDto] })
  data: UnitDto[];
}
