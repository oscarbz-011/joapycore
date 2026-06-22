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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { diskStorage } from 'multer';
import { FilesService } from './files.service';

const storage = diskStorage({
  destination: (_, __, cb) => {
    const dir = process.env['UPLOADS_DIR'] ?? 'uploads';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @Permissions('files:upload')
  @UseInterceptors(FileInterceptor('file', { storage }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir un archivo' })
  upload(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Query('module') module = 'general',
    @Query('entityType') entityType = 'generic',
    @Query('entityId') entityId?: string,
  ) {
    return this.filesService.upload(tenantId, user.sub, file, {
      module,
      entityType,
      entityId,
    });
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
    const uploadsDir = process.env['UPLOADS_DIR'] ?? 'uploads';
    const filePath = path.join(uploadsDir, path.basename(record.key));
    res.setHeader('Content-Disposition', `inline; filename="${record.originalName}"`);
    res.setHeader('Content-Type', record.mimeType);
    res.sendFile(path.resolve(filePath));
  }

  @Delete(':id')
  @Permissions('files:upload')
  @ApiOperation({ summary: 'Eliminar un archivo' })
  delete(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.filesService.delete(tenantId, id);
  }
}
