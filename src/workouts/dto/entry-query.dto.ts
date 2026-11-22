import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { QueryDto } from '../../common/query-dto';
import { IsSupportedUnit } from '../../units/is-supported-unit';

// The query of GET …/workout-entries/{id} (design §9.1, §17); OpenAPI declares
// it with @ApiQuery on the route. Rules run bottom-up, so the type check is
// written last: a repeated unit (an array) is said to be sent twice.
export class EntryQueryDto extends QueryDto {
  @IsOptional()
  @IsSupportedUnit()
  @IsNotEmpty()
  @IsString()
  unit?: string;
}
