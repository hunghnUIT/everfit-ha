import { Module } from '@nestjs/common';
import { UnitsModule } from '../units/units.module';
import { WorkoutsModule } from '../workouts/workouts.module';
import { PersonalRecordsController } from './personal-records.controller';
import { PersonalRecordsRepository } from './personal-records.repository';
import { PersonalRecordsService } from './personal-records.service';

// The personal-records routes. DatabaseModule is global; WorkoutsModule
// gives the repository that reads the winning entries back.
@Module({
  imports: [UnitsModule, WorkoutsModule],
  controllers: [PersonalRecordsController],
  providers: [PersonalRecordsRepository, PersonalRecordsService],
})
export class PersonalRecordsModule {}
