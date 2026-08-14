import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocVisibility } from '@prisma/client';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { DocumentsRepository } from '../repositories/documents.repository';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { FilterDocumentDto } from '../dto/filter-document.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(
    tenantId: string,
    filters: FilterDocumentDto,
    userRoles: string[],
    userPermissions: string[],
  ) {
    const docs = await this.documentsRepository.findAll(tenantId, filters);
    return docs.filter((doc) =>
      this.canRead(doc.visibility as DocVisibility, doc.allowedRoles, userRoles, userPermissions),
    );
  }

  async findOne(
    tenantId: string,
    id: string,
    userRoles: string[],
    userPermissions: string[],
  ) {
    const doc = await this.documentsRepository.findById(tenantId, id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (!this.canRead(doc.visibility as DocVisibility, doc.allowedRoles, userRoles, userPermissions)) {
      throw new ForbiddenException('No tienes acceso a este documento');
    }
    return doc;
  }

  async create(tenantId: string, dto: CreateDocumentDto, userId: string) {
    if (
      dto.visibility === DocVisibility.ROLE_BASED &&
      (!dto.allowedRoles || dto.allowedRoles.length === 0)
    ) {
      throw new BadRequestException(
        'Se requieren roles permitidos cuando la visibilidad es ROLE_BASED',
      );
    }

    const doc = await this.documentsRepository.create({
      tenantId,
      ...dto,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      uploadedById: userId,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.created',
      resourceId: doc.id,
      after: doc,
    } satisfies AuditLogEvent);

    return doc;
  }

  async update(tenantId: string, id: string, dto: UpdateDocumentDto, userId: string) {
    const existing = await this.documentsRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Documento no encontrado');

    if (
      dto.visibility === DocVisibility.ROLE_BASED &&
      (!dto.allowedRoles || dto.allowedRoles.length === 0)
    ) {
      throw new BadRequestException(
        'Se requieren roles permitidos cuando la visibilidad es ROLE_BASED',
      );
    }

    await this.documentsRepository.update(tenantId, id, {
      ...dto,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.updated',
      resourceId: id,
      before: existing,
    } satisfies AuditLogEvent);

    return this.documentsRepository.findById(tenantId, id);
  }

  async remove(tenantId: string, id: string, userId: string) {
    const existing = await this.documentsRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Documento no encontrado');

    await this.documentsRepository.softDelete(tenantId, id);

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.deleted',
      resourceId: id,
    } satisfies AuditLogEvent);
  }

  async getCategories(tenantId: string) {
    const rows = await this.documentsRepository.findCategories(tenantId);
    return rows.map((r) => r.category).filter(Boolean);
  }

  private canRead(
    visibility: DocVisibility,
    allowedRoles: string[],
    userRoles: string[],
    userPermissions: string[],
  ): boolean {
    if (visibility === DocVisibility.PUBLIC) return true;
    // Managers can always read private documents
    if (userPermissions.includes('documents:manage')) return true;
    if (visibility === DocVisibility.PRIVATE) return false;
    // ROLE_BASED
    return allowedRoles.some((role) => userRoles.includes(role));
  }
}
