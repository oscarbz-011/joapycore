import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { CustomersService } from '../services/customers.service';

@ApiTags('Sales')
@ApiBearerAuth()
@RequiredModule('sales')
@Controller('sales/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Permissions('customers:read')
  @ApiOperation({ summary: 'Listar clientes' })
  findAll(@CurrentTenant() tenantId: string) {
    return this.customersService.findAll(tenantId);
  }

  @Get(':id')
  @Permissions('customers:read')
  @ApiOperation({ summary: 'Obtener cliente por ID' })
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.customersService.findOne(tenantId, id);
  }

  @Post()
  @Permissions('customers:create')
  @ApiOperation({ summary: 'Crear cliente' })
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(tenantId, dto);
  }

  @Patch(':id')
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Actualizar cliente' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: Partial<CreateCustomerDto>,
  ) {
    return this.customersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Desactivar cliente' })
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.customersService.delete(tenantId, id);
  }
}
