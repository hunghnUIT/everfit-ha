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
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserIdPipe } from '../common/user-id.pipe';
import { SHARED_UNIT_REGISTRY } from '../units/unit-registry';
import { EntryInputDto } from './dto/entry-input.dto';
import { EntryQueryDto } from './dto/entry-query.dto';
import { WorkoutsService } from './workouts.service';

// HTTP only (design §9.1). The body is taken as unknown, so the global
// ValidationPipe leaves it to readEntryInputs, which words an array or an
// empty body as the expected shape.
@ApiTags('workout entries')
@Controller('users/:userId/workout-entries')
export class WorkoutsController {
  constructor(private readonly service: WorkoutsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log one entry' })
  @ApiBody({ type: EntryInputDto })
  async create(
    @Param('userId', UserIdPipe) userId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const data = await this.service.logEntry(userId, body);
    res.location(`/v1/users/${userId}/workout-entries/${data.id}`);
    return { data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One entry (the target of Location)' })
  @ApiQuery({
    name: 'unit',
    required: false,
    description: `The unit the weights are shown in, case-insensitive: ${SHARED_UNIT_REGISTRY.describe()}. Default kg.`,
    example: 'lb',
  })
  async findOne(
    @Param('userId', UserIdPipe) userId: string,
    @Param(
      'id',
      new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }),
    )
    id: string,
    @Query() query: EntryQueryDto,
  ) {
    return { data: await this.service.getEntry(userId, id, query.unit) };
  }
}
