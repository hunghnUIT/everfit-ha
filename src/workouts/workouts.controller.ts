import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiProblems } from '../common/api-docs';
import { UserIdPipe } from '../common/user-id.pipe';
import { SHARED_UNIT_REGISTRY } from '../units/unit-registry';
import { BulkInputDto, EntryInputDto } from './dto/entry-input.dto';
import {
  BulkEntriesEnvelopeDto,
  EntryEnvelopeDto,
  HistoryEnvelopeDto,
} from './dto/entry-response.dto';
import { EntryQueryDto } from './dto/entry-query.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { entryNotFound, WorkoutsService } from './workouts.service';

// HTTP only (design §9.1). The body is taken as unknown, so the global
// ValidationPipe leaves it to readEntryInputs, which words an array or an
// empty body as the expected shape.
@ApiTags('workout entries')
@ApiParam({
  name: 'userId',
  description: 'An opaque id: 1 to 64 characters of A-Z a-z 0-9 _ . -.',
  example: 'u_123',
})
@Controller('users/:userId/workout-entries')
export class WorkoutsController {
  constructor(private readonly service: WorkoutsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log one entry' })
  @ApiBody({ type: EntryInputDto })
  @ApiCreatedResponse({
    description:
      'The entry as stored. Location points at GET …/workout-entries/{id}.',
    type: EntryEnvelopeDto,
    headers: {
      Location: {
        description: 'The URL of the new entry.',
        schema: {
          type: 'string',
          example:
            '/v1/users/u_123/workout-entries/0194f2fe-6c3a-7b1d-9a2e-4f5d6c7b8a90',
        },
      },
    },
  })
  @ApiProblems(400, 413, 415)
  async create(
    @Param('userId', UserIdPipe) userId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.service.logEntry(userId, body);
    res.location(`/v1/users/${userId}/workout-entries/${data.id}`);
    return { data };
  }

  // No Location: the request creates many resources and no one URL stands
  // for them; each item carries its id (§9.1).
  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log 1 to 100 entries atomically' })
  @ApiBody({ type: BulkInputDto })
  @ApiCreatedResponse({
    description:
      'Every entry, in the order sent. No Location: each item carries its id.',
    type: BulkEntriesEnvelopeDto,
  })
  @ApiProblems(400, 413, 415)
  async createBulk(
    @Param('userId', UserIdPipe) userId: string,
    @Body() body: unknown,
  ) {
    return { data: await this.service.logBulk(userId, body) };
  }

  // Newest first: performed_at, then id, both descending (§8). The global
  // ValidationPipe checks the query against HistoryQueryDto first.
  @Get()
  @ApiOperation({
    summary: 'History: entries newest first, filtered, a page at a time',
  })
  @ApiOkResponse({
    description:
      'A page of entries, newest first. No match is a 200 with an empty data and a message.',
    type: HistoryEnvelopeDto,
  })
  @ApiProblems(400)
  async findHistory(
    @Param('userId', UserIdPipe) userId: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.service.listHistory(userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One entry (the target of Location)' })
  @ApiParam({
    name: 'id',
    description: 'The id of the entry.',
    example: '0194f2fe-6c3a-7b1d-9a2e-4f5d6c7b8a90',
  })
  @ApiOkResponse({ description: 'The entry.', type: EntryEnvelopeDto })
  @ApiProblems(400, 404)
  @ApiQuery({
    name: 'unit',
    type: String,
    required: false,
    description: `The unit the weights are shown in, case-insensitive: ${SHARED_UNIT_REGISTRY.describe()}. Default kg.`,
    example: 'lb',
  })
  async findOne(
    @Param('userId', UserIdPipe) userId: string,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => entryNotFound() }))
    id: string,
    @Query() query: EntryQueryDto,
  ) {
    return { data: await this.service.getEntry(userId, id, query.unit) };
  }
}
