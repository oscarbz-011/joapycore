import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateFileData {
  tenantId: string;
  module: string;
  entityType: string;
  entityId?: string;
  key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy?: string;
  url?: string;
}

@Injectable()
export class FilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateFileData) {
    return this.prisma.fileRecord.create({ data: { bucket: 'local', ...data } });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.fileRecord.findFirst({ where: { id, tenantId } });
  }

  findByEntity(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.fileRecord.findMany({
      where: { tenantId, entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  delete(tenantId: string, id: string) {
    return this.prisma.fileRecord.deleteMany({ where: { id, tenantId } });
  }
}
