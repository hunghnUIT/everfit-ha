import { Module } from '@nestjs/common';
import { ExercisesModule } from '../exercises/exercises.module';
import { UnitsModule } from '../units/units.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsRepository } from './workouts.repository';
import { WorkoutsService } from './workouts.service';

// The workout routes. DatabaseModule and ClockModule are global. The
// repository is exported for the personal-records routes, which read their
// winning entries back with findEntriesByIds.
@Module({
  imports: [ExercisesModule, UnitsModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsRepository, WorkoutsService],
  exports: [WorkoutsRepository],
})
export class WorkoutsModule {}
