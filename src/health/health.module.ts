import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

// The pool comes from the global DatabaseModule (PG_POOL).
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
