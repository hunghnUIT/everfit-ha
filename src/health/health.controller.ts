import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Pool } from 'pg';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    @Inject(Pool) private readonly pool: Pool,
  ) {}

  // The process is up; the database is not consulted.
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  // Ready when the database answers SELECT 1; terminus answers 503 otherwise.
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      async () => {
        const database = this.indicators.check('database');
        try {
          await this.pool.query('SELECT 1');
          return database.up();
        } catch {
          return database.down();
        }
      },
    ]);
  }
}
