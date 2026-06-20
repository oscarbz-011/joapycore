import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AreasService } from '../services/areas.service';
import { PositionsRepository } from '../repositories/positions.repository';

class CreateAreaDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}

class CreatePositionDto {
  @ApiProperty() @IsString() name: string;
}

@ApiTags('HR')
@ApiBearerAuth()
@RequiredModule('hr')
@Controller('hr')
export class AreasController {
  constructor(
    private readonly areasService: AreasService,
    private readonly positionsRepository: PositionsRepository,
  ) {}

  @Get('areas')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List areas/departments' })
  listAreas(@CurrentTenant() tenantId: string) {
    return this.areasService.list(tenantId);
  }

  @Post('areas')
  @Permissions('hr:config:manage')
  @ApiOperation({ summary: 'Create area/department' })
  createArea(@CurrentTenant() tenantId: string, @Body() dto: CreateAreaDto) {
    return this.areasService.create(tenantId, dto);
  }

  @Patch('areas/:id')
  @Permissions('hr:config:manage')
  @ApiOperation({ summary: 'Update area/department' })
  updateArea(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateAreaDto> & { isActive?: boolean },
  ) {
    return this.areasService.update(tenantId, id, dto);
  }

  @Get('positions')
  @Permissions('hr:read')
  @ApiOperation({ summary: 'List positions/job titles' })
  listPositions(@CurrentTenant() tenantId: string) {
    return this.positionsRepository.findAll(tenantId);
  }

  @Post('positions')
  @Permissions('hr:config:manage')
  @ApiOperation({ summary: 'Create position/job title' })
  createPosition(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreatePositionDto,
  ) {
    return this.positionsRepository.create(tenantId, dto);
  }

  @Patch('positions/:id')
  @Permissions('hr:config:manage')
  @ApiOperation({ summary: 'Update position/job title' })
  updatePosition(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreatePositionDto> & { isActive?: boolean },
  ) {
    return this.positionsRepository.update(tenantId, id, dto);
  }
}
