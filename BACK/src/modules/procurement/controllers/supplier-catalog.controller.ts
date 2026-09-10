import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { SupplierCatalogService } from '../services/supplier-catalog.service';
import { FilterCatalogDto } from '../dto/filter-catalog.dto';
import {
  UpdateCatalogItemDto,
  MapCatalogItemDto,
} from '../dto/update-catalog-item.dto';

// Una lista de precios es texto: 5MB es holgado y evita que alguien suba un
// archivo enorme que hay que bufferear en memoria para parsearlo.
const MAX_CATALOG_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = /\.(xlsx|csv)$/i;

@ApiTags('Procurement')
@ApiBearerAuth()
@RequiredModule('procurement')
@Controller('procurement')
export class SupplierCatalogController {
  constructor(private readonly service: SupplierCatalogService) {}

  @Get('suppliers/:supplierId/catalog')
  @Permissions('procurement:read')
  @ApiOperation({ summary: 'Listar el catálogo de un proveedor' })
  findBySupplier(
    @CurrentTenant() tenantId: string,
    @Param('supplierId') supplierId: string,
    @Query() filters: FilterCatalogDto,
  ) {
    return this.service.findBySupplier(tenantId, supplierId, filters);
  }

  @Post('suppliers/:supplierId/catalog/import')
  @Permissions('procurement:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_CATALOG_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Importar la lista de precios del proveedor (.xlsx o .csv)',
  })
  import(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('supplierId') supplierId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_EXT.test(file.originalname)) {
      throw new BadRequestException('El archivo tiene que ser .xlsx o .csv');
    }
    return this.service.importFile(tenantId, supplierId, file, user.sub);
  }

  @Patch('catalog/:id')
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Editar un ítem del catálogo' })
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.service.update(tenantId, id, dto);
  }

  @Patch('catalog/:id/product')
  @Permissions('procurement:update')
  @ApiOperation({
    summary:
      'Vincular el ítem a un producto interno (o desvincularlo con null)',
  })
  mapToProduct(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: MapCatalogItemDto,
  ) {
    return this.service.mapToProduct(tenantId, id, dto);
  }

  @Delete('catalog/:id')
  @HttpCode(204)
  @Permissions('procurement:update')
  @ApiOperation({ summary: 'Quitar un ítem del catálogo' })
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
