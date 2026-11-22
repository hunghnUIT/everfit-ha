import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock';

// Provides CLOCK once, for every module (design §8). A test fixes the time by
// overriding it: createTestApp({ providers: [{ provide: CLOCK, useValue:
// fixedClock('2025-02-11T03:00:00Z') }] }).
@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
