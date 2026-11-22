import { Module } from '@nestjs/common';
import { UNIT_REGISTRY, UnitRegistry } from './unit-registry';
import { UnitsController } from './units.controller';

// One shared registry: modules that import UnitsModule inject the same
// instance with @Inject(UNIT_REGISTRY).
@Module({
  controllers: [UnitsController],
  providers: [{ provide: UNIT_REGISTRY, useValue: new UnitRegistry() }],
  exports: [UNIT_REGISTRY],
})
export class UnitsModule {}
