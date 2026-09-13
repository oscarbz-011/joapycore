import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { DocxTemplateService } from './docx/docx-template.service';
import { PdfService } from './pdf/pdf.service';
import { LocalStorageDriver } from './storage/local-storage.driver';
import { S3StorageDriver } from './storage/s3-storage.driver';
import {
  STORAGE_DRIVERS,
  type StorageDriverRegistry,
} from './storage/storage.constants';

@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    FilesRepository,
    PdfService,
    DocxTemplateService,
    LocalStorageDriver,
    S3StorageDriver,
    {
      provide: STORAGE_DRIVERS,
      useFactory: (
        local: LocalStorageDriver,
        s3: S3StorageDriver,
      ): StorageDriverRegistry => {
        const registry: StorageDriverRegistry = new Map();
        registry.set('local', local);
        registry.set('s3', s3);
        return registry;
      },
      inject: [LocalStorageDriver, S3StorageDriver],
    },
  ],
  exports: [FilesService, PdfService, DocxTemplateService],
})
export class FilesModule {}
