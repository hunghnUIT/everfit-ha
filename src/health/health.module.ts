import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { Pool } from 'pg';
import { HealthController } from './health.controller';

// A pool of its own until the database module exists (Task 3 swaps it).
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    {
      provide: Pool,
      useFactory: () =>
        new Pool({ connectionString: process.env.DATABASE_URL }),
    },
  ],
})
export class HealthModule implements OnModuleDestroy {
  constructor(@Inject(Pool) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
