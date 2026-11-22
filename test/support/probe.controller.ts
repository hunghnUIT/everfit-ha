import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

class ProbeDto {
  @IsInt()
  @Min(1)
  n: number;

  @IsOptional()
  @IsString()
  note?: string;
}

// Test-only routes that exercise the global layer: body parser, validation
// pipe and problem filter.
@Controller('probe')
export class ProbeController {
  @Post()
  @HttpCode(200)
  echo(@Body() body: ProbeDto): ProbeDto {
    return body;
  }

  // What pg rejects with when the database is down; the message names the
  // URL, as a driver's message may name the host.
  @Get('db-down')
  dbDown(): never {
    throw Object.assign(
      new Error(`connect ECONNREFUSED ${process.env.DATABASE_URL}`),
      { code: 'ECONNREFUSED' },
    );
  }

  @Get('boom')
  boom(): never {
    throw new TypeError(
      "Cannot read properties of undefined (reading 'secretColumn')",
    );
  }
}
