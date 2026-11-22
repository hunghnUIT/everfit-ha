import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiProblems } from '../common/api-docs';
import { UserIdPipe } from '../common/user-id.pipe';
import { CompareQueryDto } from './dto/compare-query.dto';
import { RecordsQueryDto } from './dto/records-query.dto';
import {
  CompareEnvelopeDto,
  RecordsEnvelopeDto,
} from './dto/records-response.dto';
import { PersonalRecordsService } from './personal-records.service';

// HTTP only (design §9.3, §9.4). The global ValidationPipe checks each query
// against its DTO first. No route here takes a path parameter after
// personal-records, so nothing can take 'compare' for one.
@ApiTags('personal records')
@ApiParam({
  name: 'userId',
  description: 'An opaque id: 1 to 64 characters of A-Z a-z 0-9 _ . -.',
  example: 'u_123',
})
@Controller('users/:userId/personal-records')
export class PersonalRecordsController {
  constructor(private readonly service: PersonalRecordsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Personal records for one exercise: heaviest set, highest-volume set and best estimated 1RM, all-time or in a range',
  })
  @ApiOkResponse({
    description:
      'The three records, each with the date it was first achieved. Nothing found is a 200 with all three null and a message.',
    type: RecordsEnvelopeDto,
  })
  @ApiProblems(400)
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
  @ApiOkResponse({
    description:
      'Both periods and the change in each record. An empty period is a 200: its records and every delta are null, with a message.',
    type: CompareEnvelopeDto,
  })
  @ApiProblems(400)
  async compareRecords(
    @Param('userId', UserIdPipe) userId: string,
    @Query() query: CompareQueryDto,
  ) {
    return this.service.compareRecords(userId, query);
  }
}
