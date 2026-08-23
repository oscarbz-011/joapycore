import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileRecord } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { StorageDriverName } from '../config/storage.config';
import { FilesRepository } from './files.repository';
import { STORAGE_DRIVERS, type StorageDriverRegistry } from './storage/storage.constants';
import type { StorageDriver } from './storage/storage.interface';

// Subconjunto de Express.Multer.File que realmente usa upload() — permite
// llamarlo también desde código que genera archivos programáticamente
// (ej. el listener que genera contratos PDF) sin construir un multer.File completo.
export interface UploadableFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly filesRepository: FilesRepository,
    private readonly configService: ConfigService,
    @Inject(STORAGE_DRIVERS) private readonly drivers: StorageDriverRegistry,
  ) {}

  private getDriver(name: string): StorageDriver {
    const driver = this.drivers.get(name as StorageDriverName);
    if (!driver) throw new Error(`Unknown storage driver: ${name}`);
    return driver;
  }

  async upload(
    tenantId: string,
    uploadedBy: string | undefined,
    file: UploadableFile,
    meta: { module: string; entityType: string; entityId?: string },
  ) {
    const driverName = this.configService.get<StorageDriverName>('storage.driver') ?? 'local';
    const driver = this.getDriver(driverName);

    const ext = path.extname(file.originalname);
    const key = [
      tenantId,
      meta.module,
      meta.entityType,
      meta.entityId ?? 'general',
      `${randomUUID()}${ext}`,
    ].join('/');

    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    await driver.put(key, file.buffer, { contentType: file.mimetype });

    return this.filesRepository.create({
      tenantId,
      uploadedBy,
      key,
      bucket: driverName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      checksum,
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

  // El bucket del registro (no la config actual del tenant) decide qué driver
  // sirve un archivo — así uno subido en modo 'local' se sigue leyendo aunque
  // STORAGE_DRIVER haya cambiado a 's3' después.
  getFileBuffer(record: FileRecord): Promise<Buffer> {
    return this.getDriver(record.bucket).get(record.key);
  }

  getSignedDownloadUrl(record: FileRecord, expiresInSeconds = 300): Promise<string> {
    return this.getDriver(record.bucket).getSignedUrl(record.key, expiresInSeconds);
  }

  async delete(tenantId: string, id: string) {
    const record = await this.getById(tenantId, id);
    await this.getDriver(record.bucket).delete(record.key);
    await this.filesRepository.delete(tenantId, id);
  }
}
