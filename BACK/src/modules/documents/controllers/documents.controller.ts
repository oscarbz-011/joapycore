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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { FilterDocumentDto } from '../dto/filter-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { DocumentsService } from '../services/documents.service';

type JwtUser = { id: string; roles: string[]; permissions: string[] };

@ApiTags('Documents')
@ApiBearerAuth()
@RequiredModule('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  @Permissions('documents:read')
  @ApiOperation({ summary: 'Listar documentos visibles para el usuario' })
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Query() filters: FilterDocumentDto,
  ) {
    return this.service.findAll(tenantId, filters, user.roles, user.permissions);
  }

  @Get('categories')
  @Permissions('documents:read')
  @ApiOperation({ summary: 'Listar categorías en uso' })
  getCategories(@CurrentTenant() tenantId: string) {
    return this.service.getCategories(tenantId);
  }

  @Get(':id')
  @Permissions('documents:read')
  @ApiOperation({ summary: 'Obtener documento por ID' })
  findOne(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.findOne(tenantId, id, user.roles, user.permissions);
  }

  @Post()
  @Permissions('documents:manage')
  @ApiOperation({ summary: 'Crear documento' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.service.create(tenantId, dto, user.id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Permissions('documents:manage')
  @ApiOperation({ summary: 'Actualizar documento' })
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.service.update(tenantId, id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('documents:manage')
  @ApiOperation({ summary: 'Eliminar documento (soft delete)' })
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.remove(tenantId, id, user.id);
  }
}
