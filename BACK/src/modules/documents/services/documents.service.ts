import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocVisibility, Prisma } from '@prisma/client';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { EmailService } from '../../../email/email.service';
import { DocxTemplateService } from '../../../files/docx/docx-template.service';
import { unflattenVariables } from '../../../files/docx/docx-variables.util';
import { FilesService } from '../../../files/files.service';
import { DocumentSourcesRepository } from '../repositories/document-sources.repository';
import { getTemplateKindDefs } from '../constants/template-variables.constant';
import { CreateDocumentCategoryDto } from '../dto/create-document-category.dto';
import { CreateDocumentDto } from '../dto/create-document.dto';
import { FilterDocumentDto } from '../dto/filter-document.dto';
import { UpdateDocumentCategoryDto } from '../dto/update-document-category.dto';
import { UpdateDocumentDto } from '../dto/update-document.dto';
import { DocumentCategoriesRepository } from '../repositories/document-categories.repository';
import { DocumentsRepository } from '../repositories/documents.repository';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly documentsRepository: DocumentsRepository,
    private readonly categoriesRepository: DocumentCategoriesRepository,
    private readonly filesService: FilesService,
    private readonly emailService: EmailService,
    private readonly sources: DocumentSourcesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly docxTemplateService: DocxTemplateService,
  ) {}

  async findAll(
    tenantId: string,
    filters: FilterDocumentDto,
    userRoles: string[],
    userPermissions: string[],
  ) {
    const docs = await this.documentsRepository.findAll(tenantId, filters);
    return docs.filter((doc) =>
      this.canRead(
        doc.visibility,
        doc.allowedRoles,
        userRoles,
        userPermissions,
      ),
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
    if (
      !this.canRead(
        doc.visibility,
        doc.allowedRoles,
        userRoles,
        userPermissions,
      )
    ) {
      throw new ForbiddenException('No tienes acceso a este documento');
    }
    return doc;
  }

  async create(
    tenantId: string,
    dto: CreateDocumentDto,
    userId: string,
    userPermissions: string[],
  ) {
    this.assertCanWriteDocument(dto.isTemplate ?? false, userPermissions);
    const { replaceActiveTemplate, ...rest } = dto;
    await this.validateDocumentInput(tenantId, rest, undefined, {
      replaceExisting: replaceActiveTemplate,
    });
    if (rest.templateKind && replaceActiveTemplate) {
      await this.deactivateConflictingTemplate(tenantId, rest.templateKind);
    }

    const doc = await this.documentsRepository.create({
      tenantId,
      ...rest,
      expiresAt: rest.expiresAt ? new Date(rest.expiresAt) : undefined,
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

  async update(
    tenantId: string,
    id: string,
    dto: UpdateDocumentDto,
    userId: string,
    userPermissions: string[],
  ) {
    const existing = await this.documentsRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Documento no encontrado');
    this.assertCanWriteDocument(existing.isTemplate, userPermissions);

    const { replaceActiveTemplate, ...rest } = dto;
    await this.validateDocumentInput(tenantId, rest, id, {
      replaceExisting: replaceActiveTemplate,
    });
    if (rest.templateKind && replaceActiveTemplate) {
      await this.deactivateConflictingTemplate(tenantId, rest.templateKind, id);
    }

    await this.documentsRepository.update(tenantId, id, {
      ...rest,
      expiresAt: rest.expiresAt ? new Date(rest.expiresAt) : undefined,
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

  async remove(
    tenantId: string,
    id: string,
    userId: string,
    userPermissions: string[],
  ) {
    const existing = await this.documentsRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Documento no encontrado');
    this.assertCanWriteDocument(existing.isTemplate, userPermissions);

    await this.documentsRepository.softDelete(tenantId, id);

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.deleted',
      resourceId: id,
    } satisfies AuditLogEvent);
  }

  // ── Plantillas ─────────────────────────────────────────────────────────────

  getTemplateKinds() {
    return getTemplateKindDefs();
  }

  async generate(
    tenantId: string,
    id: string,
    values: Record<string, string>,
    userId: string,
    userPermissions: string[],
  ) {
    const doc = await this.documentsRepository.findById(tenantId, id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    this.assertCanWriteDocument(doc.isTemplate, userPermissions);

    if (!doc.isTemplate || doc.contentFormat !== 'DOCX') {
      throw new UnprocessableEntityException(
        'Este documento no es una plantilla DOCX generable',
      );
    }
    if (!doc.fileRecord) {
      throw new UnprocessableEntityException(
        'La plantilla no tiene un archivo .docx adjunto',
      );
    }

    let pdfBuffer: Buffer;
    try {
      const templateBuffer = await this.filesService.getFileBuffer(
        doc.fileRecord,
      );
      const filled = this.docxTemplateService.fillTemplate(
        templateBuffer,
        unflattenVariables(values),
      );
      pdfBuffer = await this.docxTemplateService.convertToPdf(filled);
    } catch (error) {
      throw new UnprocessableEntityException(
        `No se pudo generar el PDF: ${(error as Error).message}`,
      );
    }

    const fileRecord = await this.filesService.upload(
      tenantId,
      userId,
      {
        buffer: pdfBuffer,
        originalname: `${doc.title}.pdf`,
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
      },
      { module: 'documents', entityType: 'document', entityId: doc.id },
    );

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.generated',
      resourceId: doc.id,
    } satisfies AuditLogEvent);

    return { fileId: fileRecord.id };
  }

  // ── Archivo adjunto ────────────────────────────────────────────────────────

  async attachFile(
    tenantId: string,
    id: string,
    userId: string,
    userPermissions: string[],
    file: Express.Multer.File,
  ) {
    const doc = await this.documentsRepository.findById(tenantId, id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    this.assertCanWriteDocument(doc.isTemplate, userPermissions);

    const fileRecord = await this.filesService.upload(tenantId, userId, file, {
      module: 'documents',
      entityType: 'document',
      entityId: id,
    });

    let variables: Prisma.InputJsonValue | undefined;
    if (doc.isTemplate && doc.contentFormat === 'DOCX') {
      try {
        const buffer = await this.filesService.getFileBuffer(fileRecord);
        variables = this.docxTemplateService.detectVariables(
          buffer,
        ) as unknown as Prisma.InputJsonValue;
      } catch (error) {
        this.logger.warn(
          `No se pudieron detectar las variables de la plantilla DOCX del documento ${id}: ${(error as Error).message}`,
        );
      }
    }

    await this.documentsRepository.update(tenantId, id, {
      fileRecordId: fileRecord.id,
      ...(variables !== undefined && { variables }),
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.file_attached',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.documentsRepository.findById(tenantId, id);
  }

  async detachFile(
    tenantId: string,
    id: string,
    userId: string,
    userPermissions: string[],
  ) {
    const doc = await this.documentsRepository.findById(tenantId, id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    this.assertCanWriteDocument(doc.isTemplate, userPermissions);

    if (doc.fileRecordId) {
      await this.documentsRepository.update(tenantId, id, {
        fileRecordId: null,
        ...(doc.contentFormat === 'DOCX' && { variables: Prisma.JsonNull }),
      });
      await this.filesService.delete(tenantId, doc.fileRecordId);
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.file_detached',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.documentsRepository.findById(tenantId, id);
  }

  async sendEmail(
    tenantId: string,
    id: string,
    userId: string,
    userPermissions: string[],
    to?: string,
  ) {
    const doc = await this.documentsRepository.findById(tenantId, id);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    this.assertCanWriteDocument(doc.isTemplate, userPermissions);
    if (!doc.fileRecord) {
      throw new BadRequestException(
        'El documento no tiene un archivo adjunto para enviar',
      );
    }

    const recipient =
      to ??
      (await this.resolveEntityEmail(tenantId, doc.entityType, doc.entityId));
    if (!recipient) {
      throw new BadRequestException(
        'No se pudo determinar un email destino — especificá uno o vinculá el documento a un cliente con email',
      );
    }

    const buffer = await this.filesService.getFileBuffer(doc.fileRecord);
    await this.emailService.sendWithAttachment({
      to: recipient,
      subject: doc.title,
      html: `<p>Adjuntamos el documento <strong>${doc.title}</strong>.</p>`,
      attachment: {
        filename: doc.fileRecord.originalName,
        content: buffer,
        contentType: doc.fileRecord.mimeType,
      },
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document.emailed',
      resourceId: id,
      after: { to: recipient },
    } satisfies AuditLogEvent);
  }

  private async resolveEntityEmail(
    tenantId: string,
    entityType: string | null,
    entityId: string | null,
  ): Promise<string | undefined> {
    if (!entityType || !entityId) return undefined;

    if (entityType === 'customer') {
      const customer = await this.sources.findCustomer(tenantId, entityId);
      return customer?.email ?? undefined;
    }

    if (entityType === 'sale_order') {
      const saleOrder = await this.sources.findSaleOrderWithCustomer(
        tenantId,
        entityId,
      );
      return saleOrder?.customer.email ?? undefined;
    }

    return undefined;
  }

  // ── Categorías ─────────────────────────────────────────────────────────────

  listCategories(tenantId: string) {
    return this.categoriesRepository.findAll(tenantId);
  }

  async createCategory(
    tenantId: string,
    dto: CreateDocumentCategoryDto,
    userId: string,
  ) {
    const existing = await this.categoriesRepository.findByName(
      tenantId,
      dto.name,
    );
    if (existing)
      throw new ConflictException('Ya existe una categoría con ese nombre');

    const category = await this.categoriesRepository.create(tenantId, dto.name);

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document_category.created',
      resourceId: category.id,
      after: category,
    } satisfies AuditLogEvent);

    return category;
  }

  async updateCategory(
    tenantId: string,
    id: string,
    dto: UpdateDocumentCategoryDto,
    userId: string,
  ) {
    const existing = await this.categoriesRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Categoría no encontrada');

    if (dto.name) {
      const duplicate = await this.categoriesRepository.findByName(
        tenantId,
        dto.name,
      );
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Ya existe una categoría con ese nombre');
      }
    }

    await this.categoriesRepository.update(
      tenantId,
      id,
      dto.name ?? existing.name,
    );

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document_category.updated',
      resourceId: id,
      before: existing,
    } satisfies AuditLogEvent);

    return this.categoriesRepository.findById(tenantId, id);
  }

  async removeCategory(tenantId: string, id: string, userId: string) {
    const existing = await this.categoriesRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Categoría no encontrada');

    await this.categoriesRepository.softDelete(tenantId, id);

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'documents',
      action: 'document_category.deleted',
      resourceId: id,
    } satisfies AuditLogEvent);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async validateDocumentInput(
    tenantId: string,
    dto:
      | Omit<CreateDocumentDto, 'replaceActiveTemplate'>
      | Omit<UpdateDocumentDto, 'replaceActiveTemplate'>,
    excludeId?: string,
    options?: { replaceExisting?: boolean },
  ) {
    if (
      dto.visibility === DocVisibility.ROLE_BASED &&
      (!dto.allowedRoles || dto.allowedRoles.length === 0)
    ) {
      throw new BadRequestException(
        'Se requieren roles permitidos cuando la visibilidad es ROLE_BASED',
      );
    }

    if (dto.categoryId) {
      const category = await this.categoriesRepository.findById(
        tenantId,
        dto.categoryId,
      );
      if (!category)
        throw new BadRequestException('La categoría indicada no existe');
    }

    // templateKind es opcional aun para plantillas: solo se completa cuando la
    // plantilla se vincula a una función automática del sistema (ej. contrato
    // de venta a crédito). Una plantilla sin templateKind es válida — es un
    // documento reutilizable genérico, sin integración automática. Si ya hay
    // otra plantilla activa para el mismo templateKind, se rechaza con 409 —
    // salvo que el caller pida explícitamente reemplazarla (replaceExisting),
    // en cuyo caso deactivateConflictingTemplate() se encarga de liberarla.
    if (dto.templateKind && !options?.replaceExisting) {
      const existingTemplate = await this.documentsRepository.findTemplate(
        tenantId,
        dto.templateKind,
      );
      if (existingTemplate && existingTemplate.id !== excludeId) {
        throw new ConflictException(
          `Ya existe una plantilla activa para "${dto.templateKind}". Editá o eliminá la existente antes de crear otra.`,
        );
      }
    }
  }

  // Le quita el templateKind a la plantilla que hoy tiene el uso automático
  // (si existe y no es la misma que se está guardando) para que la nueva
  // pueda tomar su lugar sin chocar con el @@unique([tenantId, templateKind])
  // — usado por create()/update() cuando el usuario pide "reemplazar" en vez
  // de toparse con el 409 de validateDocumentInput.
  private async deactivateConflictingTemplate(
    tenantId: string,
    templateKind: NonNullable<CreateDocumentDto['templateKind']>,
    excludeId?: string,
  ) {
    const conflicting = await this.documentsRepository.findTemplate(
      tenantId,
      templateKind,
    );
    if (conflicting && conflicting.id !== excludeId) {
      await this.documentsRepository.update(tenantId, conflicting.id, {
        templateKind: null,
      });
    }
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
    if (userPermissions.includes('documents:templates:manage')) return true;
    if (visibility === DocVisibility.PRIVATE) return false;
    // ROLE_BASED
    return allowedRoles.some((role) => userRoles.includes(role));
  }

  // La misma ruta (create/update/remove/attachFile/detachFile/sendEmail)
  // sirve documentos comunes y plantillas — cada uno requiere un permiso
  // distinto, así que el chequeo no puede vivir en un @Permissions() del
  // controller (que gatearía la ruta entera con un solo permiso fijo).
  private assertCanWriteDocument(
    isTemplate: boolean,
    userPermissions: string[],
  ) {
    const required = isTemplate
      ? 'documents:templates:manage'
      : 'documents:manage';
    if (!userPermissions.includes(required)) {
      throw new ForbiddenException(
        isTemplate
          ? 'No tenés permiso para gestionar plantillas'
          : 'No tenés permiso para gestionar documentos',
      );
    }
  }
}
