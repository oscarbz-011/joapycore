import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { BrandsService } from '../services/brands.service';
import { CreateBrandDto } from '../dto/create-brand.dto';
import { UpdateBrandDto } from '../dto/update-brand.dto';

@ApiTags('Inventory')
@ApiBearerAuth()
@RequiredModule('inventory')
@Controller('inventory/brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Listar marcas' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.brandsService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('inventory:read')
  @ApiOperation({ summary: 'Obtener marca por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.brandsService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('inventory:create')
  @ApiOperation({ summary: 'Crear marca' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateBrandDto) {
    return this.brandsService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('inventory:update')
  @ApiOperation({ summary: 'Actualizar marca' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brandsService.update(tenantId, id, dto);
  }
}
