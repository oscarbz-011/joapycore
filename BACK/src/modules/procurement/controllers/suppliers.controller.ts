import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { SuppliersService } from '../services/suppliers.service';
import { CreateSupplierDto } from '../dto/create-supplier.dto';

@ApiTags('Procurement')
@ApiBearerAuth()
@RequiredModule('procurement')
@Controller('procurement/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Permissions('suppliers:read')
  @ApiOperation({ summary: 'Listar proveedores' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.suppliersService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('suppliers:read')
  @ApiOperation({ summary: 'Obtener proveedor por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.suppliersService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('suppliers:create')
  @ApiOperation({ summary: 'Crear proveedor' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('suppliers:update')
  @ApiOperation({ summary: 'Actualizar proveedor' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateSupplierDto>,
  ) {
    return this.suppliersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('suppliers:update')
  @ApiOperation({ summary: 'Desactivar proveedor' })
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.suppliersService.delete(tenantId, id);
  }
}
