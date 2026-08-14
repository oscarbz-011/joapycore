/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
// Remove the eslint-disable above after running `npx prisma generate`
import { Injectable } from '@nestjs/common';
import { DocType, DocVisibility } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type { DocType, DocVisibility };

export interface DocumentFilters {
  type?: DocType;
  category?: string;
  entityType?: string;
  entityId?: string;
  expiringSoonDays?: number;
  search?: string;
}

interface UpdateDocumentData {
  type?: DocType;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  visibility?: DocVisibility;
  allowedRoles?: string[];
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  entityType?: string;
  entityId?: string;
  expiresAt?: Date;
  content?: string;
}

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private get db(): any {
    return (this.prisma as any).document;
  }

  findAll(tenantId: string, filters: DocumentFilters = {}) {
    const deadline =
      filters.expiringSoonDays !== undefined
        ? (() => {
            const d = new Date();
            d.setDate(d.getDate() + (filters.expiringSoonDays as number));
            return d;
          })()
        : undefined;

    return this.db.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.type && { type: filters.type }),
        ...(filters.category && { category: filters.category }),
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.entityId && { entityId: filters.entityId }),
        ...(filters.search && {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
            { category: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
        ...(deadline && { expiresAt: { not: null, lte: deadline } }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.db.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  create(data: {
    tenantId: string;
    type: DocType;
    title: string;
    description?: string;
    category?: string;
    tags?: string[];
    visibility: DocVisibility;
    allowedRoles?: string[];
    fileUrl?: string;
    fileName?: string;
    fileSizeBytes?: number;
    mimeType?: string;
    entityType?: string;
    entityId?: string;
    expiresAt?: Date;
    content?: string;
    uploadedById?: string;
  }) {
    return this.db.create({ data });
  }

  update(tenantId: string, id: string, data: UpdateDocumentData) {
    return this.db.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  }

  softDelete(tenantId: string, id: string) {
    return this.db.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  findCategories(tenantId: string) {
    return this.db.findMany({
      where: { tenantId, deletedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
  }
}
