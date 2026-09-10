import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { ProductComponentsService } from '../services/product-components.service';
import { CreateProductComponentDto } from '../dto/create-product-component.dto';
import { UpdateProductComponentDto } from '../dto/update-product-component.dto';

@ApiTags('Production')
@ApiBearerAuth()
@RequiredModule('production')
@Controller('production/products/:productId/recipe')
export class ProductComponentsController {
  constructor(private readonly service: ProductComponentsService) {}

  @Get()
  @Permissions('production:recipes:read')
  @ApiOperation({ summary: 'Listar la receta (componentes) de un producto' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string,
  ) {
    return this.service.findByProduct(tenantId, productId);
  }

  @Post()
  @Permissions('production:recipes:manage')
  @ApiOperation({ summary: 'Agregar un componente a la receta' })
  add(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateProductComponentDto,
  ) {
    return this.service.addComponent(tenantId, productId, dto);
  }

  @Patch(':id')
  @Permissions('production:recipes:manage')
  @ApiOperation({ summary: 'Actualizar la cantidad de un componente' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductComponentDto,
  ) {
    return this.service.updateComponent(tenantId, productId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permissions('production:recipes:manage')
  @ApiOperation({ summary: 'Quitar un componente de la receta' })
  remove(
    @CurrentTenant() tenantId: string,
    @Param('productId') productId: string,
    @Param('id') id: string,
  ) {
    return this.service.removeComponent(tenantId, productId, id);
  }
}
