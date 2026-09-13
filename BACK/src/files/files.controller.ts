import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
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
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { downloadHeaders } from '../common/utils/download-headers.util';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB — el archivo se buffere en memoria antes de subirse al driver

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Permissions('files:upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir un archivo' })
  upload(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Query() dto: UploadFileDto,
  ) {
    return this.filesService.upload(tenantId, user.sub, file, {
      module: dto.module ?? 'general',
      entityType: dto.entityType ?? 'generic',
      entityId: dto.entityId,
    });
  }

  @Get()
  @Permissions('files:read')
  @ApiOperation({ summary: 'Listar archivos adjuntos a una entidad' })
  getByEntity(
    @CurrentTenant() tenantId: string,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    return this.filesService.getByEntity(tenantId, entityType, entityId);
  }

  @Get(':id')
  @Permissions('files:read')
  @ApiOperation({ summary: 'Obtener metadata de un archivo' })
  getById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.filesService.getById(tenantId, id);
  }

  @Get(':id/download')
  @Permissions('files:read')
  @ApiOperation({ summary: 'Descargar un archivo' })
  async download(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const record = await this.filesService.getById(tenantId, id);

    // El driver que subió el archivo (record.bucket) decide cómo se sirve —
    // no la config actual del tenant — para que archivos viejos sigan
    // funcionando aunque STORAGE_DRIVER haya cambiado después.
    if (record.bucket !== 'local') {
      const url = await this.filesService.getSignedDownloadUrl(record);
      return res.redirect(302, url);
    }

    const buffer = await this.filesService.getFileBuffer(record);
    const headers = downloadHeaders(record.mimeType, record.originalName);
    res.setHeader('Content-Disposition', headers.contentDisposition);
    res.setHeader('Content-Type', headers.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Aunque el navegador llegara a renderizarlo, sin permiso para scripts.
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.send(buffer);
  }

  @Delete(':id')
  @Permissions('files:delete')
  @ApiOperation({ summary: 'Eliminar un archivo' })
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.filesService.delete(tenantId, id);
  }
}
