import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { Pool } from 'pg';
import { ApiEnv } from '../config/env';
import { HealthController } from './health.controller';

// A pool of its own until the database module exists (Task 3 swaps it).
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    {
      provide: Pool,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>) =>
        new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
        }),
    },
  ],
})
export class HealthModule implements OnModuleDestroy {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
