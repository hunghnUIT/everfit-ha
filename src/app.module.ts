import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ClockModule } from './common/clock.module';
import { loggerParams } from './common/logger';
import { ApiEnv, validateApiEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { ExercisesModule } from './exercises/exercises.module';
import { HealthModule } from './health/health.module';
import { PersonalRecordsModule } from './personal-records/personal-records.module';
import { UnitsModule } from './units/units.module';
import { WorkoutsModule } from './workouts/workouts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateApiEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnv, true>) =>
        loggerParams({ LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }) }),
    }),
    ClockModule,
    DatabaseModule,
    ExercisesModule,
    HealthModule,
    PersonalRecordsModule,
    UnitsModule,
    WorkoutsModule,
  ],
})
export class AppModule {}
