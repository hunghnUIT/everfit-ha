import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validate,
} from 'class-validator';
import { IsSupportedUnit } from '../units/is-supported-unit';
import { QueryDto } from './query-dto';
import { toFieldErrors, VALIDATOR_OPTIONS } from './validation';

// A test-only query DTO, declared as Tasks 10b and 13–15 declare theirs.
// class-validator runs a property's rules bottom-up: the type check comes first.
class ProbeQueryDto extends QueryDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  exercise?: string;

  @IsOptional()
  @Max(100)
  @Min(1)
  @IsInt()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsSupportedUnit()
  @IsString()
  unit?: string;
}

class ProbeBodyDto {
  @IsString()
  name: string;
}

async function check(cls: new () => object, raw: Record<string, unknown>) {
  return toFieldErrors(
    await validate(plainToInstance(cls, raw), VALIDATOR_OPTIONS),
  );
}

const query = (raw: Record<string, unknown>) => check(ProbeQueryDto, raw);

describe('query DTOs (design §9)', () => {
  it('?exerciseName=bench → one error on exerciseName listing exercise, limit, unit', async () =>
    expect(await query({ exerciseName: 'bench' })).toEqual([
      {
        path: 'exerciseName',
        message:
          "Unknown query parameter 'exerciseName'. Accepted parameters: exercise, limit, unit.",
      },
    ]));

  it('exercise sent twice (an array) → "sent more than once" on exercise', async () =>
    expect(await query({ exercise: ['bench', 'squat'] })).toEqual([
      {
        path: 'exercise',
        message: "'exercise' was sent more than once; send it once.",
      },
    ]));

  it('exercise= → one error on exercise; limit=abc, 0 or 101 → one error on limit', async () => {
    expect(await query({ exercise: '' })).toEqual([
      { path: 'exercise', message: expect.any(String) },
    ]);
    for (const limit of ['abc', '0', '101']) {
      expect(await query({ limit })).toEqual([
        { path: 'limit', message: expect.any(String) },
      ]);
    }
    expect(await query({ exercise: 'bench', limit: '100' })).toEqual([]);
  });

  it('unit=LBS passes; unit=stone → the unknown-unit message on unit', async () => {
    expect(await query({ unit: 'LBS' })).toEqual([]);
    expect(await query({ unit: 'stone' })).toEqual([
      {
        path: 'unit',
        message:
          "Unsupported unit 'stone'. Supported units: kg (kgs), lb (lbs).",
      },
    ]);
  });

  it("an unknown property on a body DTO keeps class-validator's own message", async () =>
    expect(await check(ProbeBodyDto, { name: 'a', extra: 1 })).toEqual([
      { path: 'extra', message: 'property extra should not exist' },
    ]));
});
