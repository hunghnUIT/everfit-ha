import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserIdPipe } from '../common/user-id.pipe';
import { RecordsQueryDto } from './dto/records-query.dto';
import { PersonalRecordsService } from './personal-records.service';

// HTTP only (design §9.3). The global ValidationPipe checks the query
// against RecordsQueryDto first.
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
}
