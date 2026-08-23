import { Injectable } from '@nestjs/common';
import { DocContentFormat, DocType, DocVisibility, Prisma, TemplateKind } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type { DocContentFormat, DocType, DocVisibility, TemplateKind };

export interface DocumentFilters {
  type?: DocType;
  categoryId?: string;
  isTemplate?: boolean;
  templateKind?: TemplateKind;
  entityType?: string;
  entityId?: string;
  expiringSoonDays?: number;
  search?: string;
}

interface CreateDocumentData {
  tenantId: string;
  type: DocType;
  title: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  visibility: DocVisibility;
  allowedRoles?: string[];
  entityType?: string;
  entityId?: string;
  expiresAt?: Date;
  content?: string;
  contentFormat?: DocContentFormat;
  isTemplate?: boolean;
  templateKind?: TemplateKind;
  variables?: Prisma.InputJsonValue;
  fileRecordId?: string;
  uploadedById?: string;
}

interface UpdateDocumentData {
  type?: DocType;
  title?: string;
  description?: string;
  categoryId?: string | null;
  tags?: string[];
  visibility?: DocVisibility;
  allowedRoles?: string[];
  entityType?: string;
  entityId?: string;
  expiresAt?: Date;
  content?: string;
  contentFormat?: DocContentFormat;
  isTemplate?: boolean;
  templateKind?: TemplateKind | null;
  variables?: Prisma.InputJsonValue;
  fileRecordId?: string | null;
}

@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      category: true,
      fileRecord: true,
    } satisfies Prisma.DocumentInclude;
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

    return this.prisma.document.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(filters.type && { type: filters.type }),
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(filters.isTemplate !== undefined && { isTemplate: filters.isTemplate }),
        ...(filters.templateKind && { templateKind: filters.templateKind }),
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.entityId && { entityId: filters.entityId }),
        ...(filters.search && {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
            { category: { name: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }),
        ...(deadline && { expiresAt: { not: null, lte: deadline } }),
      },
      include: this.include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.include,
    });
  }

  findTemplate(tenantId: string, templateKind: TemplateKind) {
    return this.prisma.document.findFirst({
      where: { tenantId, templateKind, isTemplate: true, deletedAt: null },
      include: this.include,
    });
  }

  create(data: CreateDocumentData) {
    return this.prisma.document.create({ data, include: this.include });
  }

  update(tenantId: string, id: string, data: UpdateDocumentData) {
    return this.prisma.document.updateMany({ where: { id, tenantId, deletedAt: null }, data });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.document.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
