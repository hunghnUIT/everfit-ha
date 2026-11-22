import { Module } from '@nestjs/common';
import { SHARED_UNIT_REGISTRY, UNIT_REGISTRY } from './unit-registry';
import { UnitsController } from './units.controller';

// One shared registry: modules that import UnitsModule inject the same
// instance with @Inject(UNIT_REGISTRY).
@Module({
  controllers: [UnitsController],
  providers: [{ provide: UNIT_REGISTRY, useValue: SHARED_UNIT_REGISTRY }],
  exports: [UNIT_REGISTRY],
})
export class UnitsModule {}
