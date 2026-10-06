import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { MarkUncollectibleDto } from '../dto/mark-uncollectible.dto';
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
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(tenantId, dto, user.sub);
  }

  @Patch(':id')
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Actualizar cliente' })
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: Partial<CreateCustomerDto>,
  ) {
    return this.customersService.update(tenantId, id, dto, user.sub);
  }

  @Post(':id/uncollectible')
  @HttpCode(HttpStatus.OK)
  @Permissions('sales:credit:evaluate')
  @ApiOperation({
    summary: 'Marcar al cliente como incobrable/judicial (calificación 6)',
  })
  markUncollectible(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: MarkUncollectibleDto,
  ) {
    return this.customersService.markUncollectible(
      tenantId,
      id,
      dto.reason,
      user.sub,
    );
  }

  @Delete(':id/uncollectible')
  @Permissions('sales:credit:evaluate')
  @ApiOperation({ summary: 'Quitar la marca de incobrable/judicial' })
  clearUncollectible(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.customersService.clearUncollectible(tenantId, id, user.sub);
  }

  @Delete(':id')
  @Permissions('customers:update')
  @ApiOperation({ summary: 'Desactivar cliente' })
  delete(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.customersService.delete(tenantId, id, user.sub);
  }
}
