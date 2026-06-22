import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import { FilesRepository } from './files.repository';

@Injectable()
export class FilesService {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly configService: ConfigService,
  ) {}

  async upload(
    tenantId: string,
    uploadedBy: string,
    file: Express.Multer.File,
    meta: { module: string; entityType: string; entityId?: string },
  ) {
    const uploadsDir = this.configService.get<string>('UPLOADS_DIR', 'uploads');
    const key = path.relative(uploadsDir, file.path).replace(/\\/g, '/');
    const url = `/files/${path.basename(file.path)}/download`;

    return this.filesRepository.create({
      tenantId,
      uploadedBy,
      key,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      url,
      ...meta,
    });
  }

  async getById(tenantId: string, id: string) {
    const file = await this.filesRepository.findById(tenantId, id);
    if (!file) throw new NotFoundException('Archivo no encontrado');
    return file;
  }

  getByEntity(tenantId: string, entityType: string, entityId: string) {
    return this.filesRepository.findByEntity(tenantId, entityType, entityId);
  }

  async delete(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    await this.filesRepository.delete(tenantId, id);
  }
}
