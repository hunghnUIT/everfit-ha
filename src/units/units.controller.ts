import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UNIT_REGISTRY, UnitRegistry } from './unit-registry';

@ApiTags('units')
@Controller('units')
export class UnitsController {
  constructor(@Inject(UNIT_REGISTRY) private readonly registry: UnitRegistry) {}

  @Get()
  @ApiOperation({ summary: 'Supported units and their aliases' })
  list() {
    return { data: this.registry.list() };
  }
}
