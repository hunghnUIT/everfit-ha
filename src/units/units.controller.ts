import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UnitsEnvelopeDto } from './dto/unit-response.dto';
import { UNIT_REGISTRY, UnitRegistry } from './unit-registry';

@ApiTags('units')
@Controller('v1/units')
export class UnitsController {
  constructor(@Inject(UNIT_REGISTRY) private readonly registry: UnitRegistry) {}

  @Get()
  @ApiOperation({ summary: 'Supported units and their aliases' })
  @ApiOkResponse({
    description: 'Each unit code with its aliases.',
    type: UnitsEnvelopeDto,
  })
  list() {
    return { data: this.registry.list() };
  }
}
