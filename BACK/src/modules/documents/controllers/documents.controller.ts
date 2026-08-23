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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import { CreateDocumentCategoryDto } from '../dto/create-document-category.dto';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { FilterDocumentDto } from '../dto/filter-document.dto';
import { SendDocumentEmailDto } from '../dto/send-document-email.dto';
import { UpdateDocumentCategoryDto } from '../dto/update-document-category.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { DocumentsService } from '../services/documents.service';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — igual que FilesController

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

  // ── Categorías ─────────────────────────────────────────────────────────────
  // Rutas fijas antes de ':id' para que no colisionen con el parámetro dinámico.

  @Get('categories')
  @Permissions('documents:categories:read')
  @ApiOperation({ summary: 'Listar categorías de documentos' })
  listCategories(@CurrentTenant() tenantId: string) {
    return this.service.listCategories(tenantId);
  }

  @Post('categories')
  @Permissions('documents:categories:manage')
  @ApiOperation({ summary: 'Crear categoría de documentos' })
  createCategory(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateDocumentCategoryDto,
  ) {
    return this.service.createCategory(tenantId, dto, user.id);
  }

  @Patch('categories/:id')
  @Permissions('documents:categories:manage')
  @ApiOperation({ summary: 'Actualizar categoría de documentos' })
  updateCategory(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentCategoryDto,
  ) {
    return this.service.updateCategory(tenantId, id, dto, user.id);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('documents:categories:manage')
  @ApiOperation({ summary: 'Eliminar categoría de documentos (soft delete)' })
  removeCategory(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.removeCategory(tenantId, id, user.id);
  }

  @Get('template-kinds')
  @Permissions('documents:templates:read')
  @ApiOperation({ summary: 'Listar tipos de plantilla disponibles y sus variables' })
  getTemplateKinds() {
    return this.service.getTemplateKinds();
  }

  // ── Documento individual ──────────────────────────────────────────────────
  // create/update/remove/attachFile/detachFile/sendEmail NO declaran
  // @Permissions() a nivel de ruta a propósito: la misma ruta sirve tanto
  // documentos comunes como plantillas (discriminado por isTemplate en el
  // body/registro, no por URL), y cada uno requiere un permiso distinto
  // (documents:manage vs documents:templates:manage) — el chequeo se hace
  // dentro del service, una vez que sabe con cuál de los dos está tratando.
  // Igual que documents:read, mismo criterio que el canRead() ya existente.

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
  @ApiOperation({ summary: 'Crear documento' })
  create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.service.create(tenantId, dto, user.id, user.permissions);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar documento' })
  update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.service.update(tenantId, id, dto, user.id, user.permissions);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar documento (soft delete)' })
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.remove(tenantId, id, user.id, user.permissions);
  }

  // ── Archivo adjunto ──────────────────────────────────────────────────────

  @Post(':id/file')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Adjuntar (o reemplazar) el archivo de un documento' })
  attachFile(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.attachFile(tenantId, id, user.id, user.permissions, file);
  }

  @Delete(':id/file')
  @ApiOperation({ summary: 'Quitar el archivo adjunto de un documento' })
  detachFile(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.detachFile(tenantId, id, user.id, user.permissions);
  }

  @Post(':id/email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Enviar el documento adjunto por email' })
  sendEmail(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: SendDocumentEmailDto,
  ) {
    return this.service.sendEmail(tenantId, id, user.id, user.permissions, dto.to);
  }
}
