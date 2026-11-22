import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserIdPipe } from '../common/user-id.pipe';
import { CompareQueryDto } from './dto/compare-query.dto';
import { RecordsQueryDto } from './dto/records-query.dto';
import { PersonalRecordsService } from './personal-records.service';

// HTTP only (design §9.3, §9.4). The global ValidationPipe checks each query
// against its DTO first. No route here takes a path parameter after
// personal-records, so nothing can take 'compare' for one.
@ApiTags('personal records')
@Controller('users/:userId/personal-records')
export class PersonalRecordsController {
  constructor(private readonly service: PersonalRecordsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Personal records for one exercise: heaviest set, highest-volume set and best estimated 1RM, all-time or in a range',
  })
  async findRecords(
    @Param('userId', UserIdPipe) userId: string,
    @Query() query: RecordsQueryDto,
  ) {
    return this.service.getRecords(userId, query);
  }

  @Get('compare')
  @ApiOperation({
    summary:
      'Personal records for one exercise in a current period and a comparison period, read at one moment, with the change in each record',
  })
  async compareRecords(
    @Param('userId', UserIdPipe) userId: string,
    @Query() query: CompareQueryDto,
  ) {
    return this.service.compareRecords(userId, query);
  }
}
