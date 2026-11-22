import { Inject, Injectable } from '@nestjs/common';
import { validationProblem } from '../common/problem';
import { UNIT_REGISTRY, UnitRegistry } from '../units/unit-registry';
import { UnitCode } from '../units/weight-units';
import { RecordsQueryDto } from './dto/records-query.dto';
import { PersonalRecordsRepository } from './personal-records.repository';
import { readRecordsQuery } from './records-query';
import { RecordsJson, toRecordsResponse } from './records-response';

export type RecordsData = {
  exercise: { key: string };
  unit: UnitCode;
  range: { from: string | null; to: string | null };
  records: RecordsJson;
};

// Design §9.3: fixed text, the same whether the name or the range was the
// reason, so no second query is spent finding out which. It quotes the key,
// which is what was searched for, and points at the filter that finds names
// containing it.
export function noRecordsMessage(userId: string, key: string): string {
  return (
    `No entries found for exercise '${key}' in this range. This filter ` +
    'matches the whole exercise name; ' +
    `GET /v1/users/${userId}/workout-entries?exercise=${encodeURIComponent(key)} ` +
    'lists the names that contain it.'
  );
}

// Orchestration only.
@Injectable()
export class PersonalRecordsService {
  constructor(
    @Inject(UNIT_REGISTRY) private readonly units: UnitRegistry,
    private readonly repository: PersonalRecordsRepository,
  ) {}

  async getRecords(
    userId: string,
    query: RecordsQueryDto,
  ): Promise<{ data: RecordsData; message?: string }> {
    const checked = readRecordsQuery(query, this.units);
    if (!checked.ok) throw validationProblem(checked.errors);
    const { key, from, to, unit } = checked.value;
    const found = await this.repository.findRecords(userId, key, { from, to });
    const data: RecordsData = {
      exercise: { key },
      unit,
      range: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      records: toRecordsResponse(found, unit, this.units),
    };
    // The three records read the same rows, so they are empty together.
    return found.weight === null
      ? { data, message: noRecordsMessage(userId, key) }
      : { data };
  }
}
