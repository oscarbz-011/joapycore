import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocContentFormat,
  DocType,
  DocVisibility,
  Prisma,
  TemplateKind,
} from '@prisma/client';
import { DocumentsService } from './services/documents.service';
import { DocumentSourcesRepository } from './repositories/document-sources.repository';
import { InvoiceOnIssueListener } from './events/invoice-on-issue.listener';

// ── Fixtures ──────────────────────────────────────────────────────────────────

interface DocFixture {
  id: string;
  tenantId: string;
  type: DocType;
  title: string;
  description: string | null;
  categoryId: string | null;
  tags: string[];
  visibility: DocVisibility;
  allowedRoles: string[];
  fileRecordId: string | null;
  fileRecord: { id: string; originalName: string; mimeType: string } | null;
  entityType: string | null;
  entityId: string | null;
  expiresAt: Date | null;
  content: string | null;
  contentFormat: DocContentFormat;
  isTemplate: boolean;
  templateKind: TemplateKind | null;
  variables: unknown;
  uploadedById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function makeDoc(overrides: Partial<DocFixture> = {}): DocFixture {
  return {
    id: 'doc-1',
    tenantId: 'tenant-1',
    type: DocType.INTERNAL,
    title: 'Test doc',
    description: null,
    categoryId: null,
    tags: [],
    visibility: DocVisibility.PUBLIC,
    allowedRoles: [],
    fileRecordId: null,
    fileRecord: null,
    entityType: null,
    entityId: null,
    expiresAt: null,
    content: null,
    contentFormat: DocContentFormat.TIPTAP,
    isTemplate: false,
    templateKind: null,
    variables: null,
    uploadedById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

interface CategoryFixture {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
  deletedAt: Date | null;
}

function makeCategory(
  overrides: Partial<CategoryFixture> = {},
): CategoryFixture {
  return {
    id: 'cat-1',
    tenantId: 'tenant-1',
    name: 'Legal',
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('DocumentsService', () => {
  let service: DocumentsService;
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findTemplate: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };
  let categoriesRepo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByName: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
  };
  let filesService: {
    upload: jest.Mock;
    delete: jest.Mock;
    getFileBuffer: jest.Mock;
  };
  let emailService: { sendWithAttachment: jest.Mock };
  let prisma: {
    customer: { findFirst: jest.Mock };
    saleOrder: { findFirst: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };
  let docxTemplateService: {
    detectVariables: jest.Mock;
    fillTemplate: jest.Mock;
    convertToPdf: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findTemplate: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ count: 1 }),
      softDelete: jest.fn().mockResolvedValue({ count: 1 }),
    };
    categoriesRepo = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      findByName: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ count: 1 }),
      softDelete: jest.fn().mockResolvedValue({ count: 1 }),
    };
    filesService = {
      upload: jest.fn(),
      delete: jest.fn(),
      getFileBuffer: jest.fn(),
    };
    emailService = {
      sendWithAttachment: jest.fn().mockResolvedValue({
        to: 'cliente@example.com',
        messageId: 'smtp-message-1',
        accepted: ['cliente@example.com'],
      }),
    };
    prisma = {
      customer: { findFirst: jest.fn() },
      saleOrder: { findFirst: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };
    docxTemplateService = {
      detectVariables: jest.fn(),
      fillTemplate: jest.fn(),
      convertToPdf: jest.fn(),
    };
    service = new DocumentsService(
      repo as any,
      categoriesRepo as any,
      filesService as any,
      emailService as any,
      new DocumentSourcesRepository(prisma as any),
      eventEmitter as any,
      docxTemplateService,
    );
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns PUBLIC docs for any user', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ visibility: DocVisibility.PUBLIC }),
      ]);

      const result = await service.findAll('tenant-1', {}, [], []);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doc-1');
    });

    it('hides PRIVATE docs when user lacks documents:manage', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ visibility: DocVisibility.PRIVATE }),
      ]);

      const result = await service.findAll(
        'tenant-1',
        {},
        [],
        ['documents:read'],
      );

      expect(result).toHaveLength(0);
    });

    it('shows PRIVATE docs when user has documents:manage', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ visibility: DocVisibility.PRIVATE }),
      ]);

      const result = await service.findAll(
        'tenant-1',
        {},
        [],
        ['documents:manage'],
      );

      expect(result).toHaveLength(1);
    });

    it('shows ROLE_BASED doc when user has a matching role', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({
          visibility: DocVisibility.ROLE_BASED,
          allowedRoles: ['Admin', 'Supervisor'],
        }),
      ]);

      const result = await service.findAll('tenant-1', {}, ['Supervisor'], []);

      expect(result).toHaveLength(1);
    });

    it('hides ROLE_BASED doc when user has no matching role', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({
          visibility: DocVisibility.ROLE_BASED,
          allowedRoles: ['Admin'],
        }),
      ]);

      const result = await service.findAll('tenant-1', {}, ['Staff'], []);

      expect(result).toHaveLength(0);
    });

    it('shows ROLE_BASED doc to documents:manage even without matching role', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({
          visibility: DocVisibility.ROLE_BASED,
          allowedRoles: ['Admin'],
        }),
      ]);

      const result = await service.findAll(
        'tenant-1',
        {},
        ['Staff'],
        ['documents:manage'],
      );

      expect(result).toHaveLength(1);
    });

    it('filters multiple docs with mixed visibility', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ id: 'doc-pub', visibility: DocVisibility.PUBLIC }),
        makeDoc({ id: 'doc-priv', visibility: DocVisibility.PRIVATE }),
        makeDoc({
          id: 'doc-role',
          visibility: DocVisibility.ROLE_BASED,
          allowedRoles: ['Admin'],
        }),
      ]);

      const result = await service.findAll('tenant-1', {}, ['Staff'], []);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doc-pub');
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns doc when user can read it', async () => {
      repo.findById.mockResolvedValue(makeDoc());

      const result = await service.findOne('tenant-1', 'doc-1', [], []);

      expect(result.id).toBe('doc-1');
    });

    it('throws NotFoundException when doc does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.findOne('tenant-1', 'ghost', [], []),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when user cannot read the doc', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({ visibility: DocVisibility.PRIVATE }),
      );

      await expect(
        service.findOne('tenant-1', 'doc-1', [], ['documents:read']),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns PRIVATE doc for documents:manage holder', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({ visibility: DocVisibility.PRIVATE }),
      );

      const result = await service.findOne(
        'tenant-1',
        'doc-1',
        [],
        ['documents:manage'],
      );

      expect(result.id).toBe('doc-1');
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates doc and emits audit.log', async () => {
      const created = makeDoc();
      repo.create.mockResolvedValue(created);

      const result = await service.create(
        'tenant-1',
        {
          type: DocType.INTERNAL,
          title: 'Test',
          visibility: DocVisibility.PUBLIC,
        },
        'user-1',
        ['documents:manage'],
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          uploadedById: 'user-1',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'document.created',
          resourceId: created.id,
        }),
      );
      expect(result.id).toBe('doc-1');
    });

    it('throws BadRequestException when ROLE_BASED with no allowedRoles', async () => {
      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.INTERNAL,
            title: 'Secret',
            visibility: DocVisibility.ROLE_BASED,
          },
          'user-1',
          ['documents:manage'],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when ROLE_BASED with empty allowedRoles array', async () => {
      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.INTERNAL,
            title: 'Secret',
            visibility: DocVisibility.ROLE_BASED,
            allowedRoles: [],
          },
          'user-1',
          ['documents:manage'],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates ROLE_BASED doc when allowedRoles is provided', async () => {
      repo.create.mockResolvedValue(
        makeDoc({
          visibility: DocVisibility.ROLE_BASED,
          allowedRoles: ['Admin'],
        }),
      );

      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.INTERNAL,
            title: 'Restricted',
            visibility: DocVisibility.ROLE_BASED,
            allowedRoles: ['Admin'],
          },
          'user-1',
          ['documents:manage'],
        ),
      ).resolves.toBeDefined();
    });

    it('converts expiresAt string to Date before saving', async () => {
      const isoDate = '2026-12-31T00:00:00.000Z';
      repo.create.mockResolvedValue(makeDoc());

      await service.create(
        'tenant-1',
        {
          type: DocType.CONTRACT,
          title: 'Expiring',
          visibility: DocVisibility.PUBLIC,
          expiresAt: isoDate,
        },
        'user-1',
        ['documents:manage'],
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: new Date(isoDate) }),
      );
    });

    it('throws BadRequestException when categoryId does not exist for tenant', async () => {
      categoriesRepo.findById.mockResolvedValue(null);

      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.INTERNAL,
            title: 'Test',
            visibility: DocVisibility.PUBLIC,
            categoryId: 'ghost',
          },
          'user-1',
          ['documents:manage'],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates a generic template (isTemplate=true) without a templateKind', async () => {
      repo.create.mockResolvedValue(
        makeDoc({ isTemplate: true, templateKind: null }),
      );

      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.CONTRACT,
            title: 'Plantilla genérica',
            visibility: DocVisibility.PRIVATE,
            isTemplate: true,
          },
          'user-1',
          ['documents:templates:manage'],
        ),
      ).resolves.toBeDefined();

      expect(repo.findTemplate).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a template of that kind already exists', async () => {
      repo.findTemplate.mockResolvedValue(
        makeDoc({ id: 'existing-template', isTemplate: true }),
      );

      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.CONTRACT,
            title: 'Plantilla 2',
            visibility: DocVisibility.PRIVATE,
            isTemplate: true,
            templateKind: TemplateKind.SALE_CONTRACT,
          },
          'user-1',
          ['documents:templates:manage'],
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('replaceActiveTemplate: deactivates the conflicting template instead of throwing', async () => {
      const conflicting = makeDoc({
        id: 'existing-template',
        isTemplate: true,
        templateKind: TemplateKind.SALE_CONTRACT,
      });
      repo.findTemplate.mockResolvedValue(conflicting);
      repo.create.mockResolvedValue(
        makeDoc({
          id: 'new-template',
          isTemplate: true,
          templateKind: TemplateKind.SALE_CONTRACT,
        }),
      );

      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.CONTRACT,
            title: 'Plantilla nueva',
            visibility: DocVisibility.PRIVATE,
            isTemplate: true,
            templateKind: TemplateKind.SALE_CONTRACT,
            replaceActiveTemplate: true,
          },
          'user-1',
          ['documents:templates:manage'],
        ),
      ).resolves.toBeDefined();

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'existing-template',
        { templateKind: null },
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ templateKind: TemplateKind.SALE_CONTRACT }),
      );
      // replaceActiveTemplate es un flag de control, no un campo del modelo — no debe llegar al repositorio.
      const createArg = repo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(createArg).not.toHaveProperty('replaceActiveTemplate');
    });

    it('replaceActiveTemplate: no-op when there is no conflicting template', async () => {
      repo.findTemplate.mockResolvedValue(null);
      repo.create.mockResolvedValue(
        makeDoc({ isTemplate: true, templateKind: TemplateKind.SALE_CONTRACT }),
      );

      await service.create(
        'tenant-1',
        {
          type: DocType.CONTRACT,
          title: 'Plantilla',
          visibility: DocVisibility.PRIVATE,
          isTemplate: true,
          templateKind: TemplateKind.SALE_CONTRACT,
          replaceActiveTemplate: true,
        },
        'user-1',
        ['documents:templates:manage'],
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('creates a template doc when no other template of that kind exists', async () => {
      repo.findTemplate.mockResolvedValue(null);
      repo.create.mockResolvedValue(
        makeDoc({ isTemplate: true, templateKind: TemplateKind.SALE_CONTRACT }),
      );

      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.CONTRACT,
            title: 'Plantilla',
            visibility: DocVisibility.PRIVATE,
            isTemplate: true,
            templateKind: TemplateKind.SALE_CONTRACT,
          },
          'user-1',
          ['documents:templates:manage'],
        ),
      ).resolves.toBeDefined();
    });

    it('throws ForbiddenException when creating a template without documents:templates:manage', async () => {
      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.CONTRACT,
            title: 'Plantilla',
            visibility: DocVisibility.PRIVATE,
            isTemplate: true,
            templateKind: TemplateKind.SALE_CONTRACT,
          },
          'user-1',
          ['documents:manage'],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when creating a regular doc without documents:manage', async () => {
      await expect(
        service.create(
          'tenant-1',
          {
            type: DocType.INTERNAL,
            title: 'Test',
            visibility: DocVisibility.PUBLIC,
          },
          'user-1',
          ['documents:templates:manage'],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates doc and emits audit.log', async () => {
      const existing = makeDoc();
      repo.findById
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ ...existing, title: 'Updated' });

      const result = await service.update(
        'tenant-1',
        'doc-1',
        { title: 'Updated' },
        'user-1',
        ['documents:manage'],
      );

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'doc-1',
        expect.objectContaining({ title: 'Updated' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'document.updated',
          before: existing,
        }),
      );
      expect(result?.title).toBe('Updated');
    });

    it('throws NotFoundException when doc does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'ghost', { title: 'X' }, 'user-1', [
          'documents:manage',
        ]),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when changing to ROLE_BASED with no roles', async () => {
      repo.findById.mockResolvedValue(makeDoc());

      await expect(
        service.update(
          'tenant-1',
          'doc-1',
          { visibility: DocVisibility.ROLE_BASED, allowedRoles: [] },
          'user-1',
          ['documents:manage'],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows updating a template to keep its own templateKind (excludes itself from the conflict check)', async () => {
      const existing = makeDoc({
        isTemplate: true,
        templateKind: TemplateKind.SALE_CONTRACT,
      });
      repo.findById
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(existing);
      repo.findTemplate.mockResolvedValue(existing);

      await expect(
        service.update(
          'tenant-1',
          'doc-1',
          {
            templateKind: TemplateKind.SALE_CONTRACT,
            title: 'Plantilla renombrada',
          },
          'user-1',
          ['documents:templates:manage'],
        ),
      ).resolves.toBeDefined();
    });

    it('replaceActiveTemplate on update: deactivates the OTHER conflicting template, not itself', async () => {
      const beingEdited = makeDoc({
        id: 'doc-1',
        isTemplate: true,
        templateKind: null,
      });
      const conflicting = makeDoc({
        id: 'other-template',
        isTemplate: true,
        templateKind: TemplateKind.SALE_CONTRACT,
      });
      repo.findById.mockResolvedValueOnce(beingEdited).mockResolvedValueOnce({
        ...beingEdited,
        templateKind: TemplateKind.SALE_CONTRACT,
      });
      repo.findTemplate.mockResolvedValue(conflicting);

      await service.update(
        'tenant-1',
        'doc-1',
        {
          templateKind: TemplateKind.SALE_CONTRACT,
          replaceActiveTemplate: true,
        },
        'user-1',
        ['documents:templates:manage'],
      );

      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'other-template', {
        templateKind: null,
      });
      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'doc-1',
        expect.objectContaining({ templateKind: TemplateKind.SALE_CONTRACT }),
      );
    });

    it('throws ForbiddenException when updating a template without documents:templates:manage', async () => {
      const existing = makeDoc({
        isTemplate: true,
        templateKind: TemplateKind.SALE_CONTRACT,
      });
      repo.findById.mockResolvedValue(existing);

      await expect(
        service.update('tenant-1', 'doc-1', { title: 'X' }, 'user-1', [
          'documents:manage',
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes doc and emits audit.log', async () => {
      repo.findById.mockResolvedValue(makeDoc());

      await service.remove('tenant-1', 'doc-1', 'user-1', ['documents:manage']);

      expect(repo.softDelete).toHaveBeenCalledWith('tenant-1', 'doc-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'document.deleted',
          resourceId: 'doc-1',
        }),
      );
    });

    it('throws NotFoundException when doc does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.remove('tenant-1', 'ghost', 'user-1', ['documents:manage']),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when removing a template without documents:templates:manage', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({ isTemplate: true, templateKind: TemplateKind.SALE_CONTRACT }),
      );

      await expect(
        service.remove('tenant-1', 'doc-1', 'user-1', ['documents:manage']),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  // ── categorías ────────────────────────────────────────────────────────────

  describe('listCategories', () => {
    it('returns categories from repo', async () => {
      categoriesRepo.findAll.mockResolvedValue([
        makeCategory(),
        makeCategory({ id: 'cat-2', name: 'Finanzas' }),
      ]);

      const result = await service.listCategories('tenant-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('createCategory', () => {
    it('creates category and emits audit.log', async () => {
      categoriesRepo.findByName.mockResolvedValue(null);
      const created = makeCategory();
      categoriesRepo.create.mockResolvedValue(created);

      const result = await service.createCategory(
        'tenant-1',
        { name: 'Legal' },
        'user-1',
      );

      expect(categoriesRepo.create).toHaveBeenCalledWith('tenant-1', 'Legal');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'document_category.created',
        }),
      );
      expect(result.id).toBe('cat-1');
    });

    it('throws ConflictException when a category with that name already exists', async () => {
      categoriesRepo.findByName.mockResolvedValue(makeCategory());

      await expect(
        service.createCategory('tenant-1', { name: 'Legal' }, 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(categoriesRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateCategory', () => {
    it('throws NotFoundException when category does not exist', async () => {
      categoriesRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateCategory('tenant-1', 'ghost', { name: 'X' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when renaming to an existing name', async () => {
      categoriesRepo.findById.mockResolvedValue(makeCategory());
      categoriesRepo.findByName.mockResolvedValue(
        makeCategory({ id: 'cat-2', name: 'Finanzas' }),
      );

      await expect(
        service.updateCategory(
          'tenant-1',
          'cat-1',
          { name: 'Finanzas' },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('sendEmail', () => {
    const fileRecord = {
      id: 'file-1',
      originalName: 'contrato.pdf',
      mimeType: 'application/pdf',
    };

    it('sends to the explicit "to" address when provided', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({ fileRecordId: 'file-1', fileRecord }),
      );
      filesService.getFileBuffer.mockResolvedValue(Buffer.from('pdf'));

      const result = await service.sendEmail(
        'tenant-1',
        'doc-1',
        'user-1',
        ['documents:manage'],
        'explicit@example.com',
      );

      expect(emailService.sendWithAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'explicit@example.com' }),
      );
      expect(result).toEqual(
        expect.objectContaining({ messageId: 'smtp-message-1' }),
      );
    });

    it('resolves the recipient from a linked customer entity', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({
          fileRecordId: 'file-1',
          fileRecord,
          entityType: 'customer',
          entityId: 'cust-1',
        }),
      );
      filesService.getFileBuffer.mockResolvedValue(Buffer.from('pdf'));
      prisma.customer.findFirst.mockResolvedValue({
        email: 'cliente@example.com',
      });

      await service.sendEmail('tenant-1', 'doc-1', 'user-1', [
        'documents:manage',
      ]);

      expect(emailService.sendWithAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'cliente@example.com' }),
      );
    });

    it('resolves the recipient from a linked sale_order entity via its customer', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({
          fileRecordId: 'file-1',
          fileRecord,
          entityType: 'sale_order',
          entityId: 'order-1',
        }),
      );
      filesService.getFileBuffer.mockResolvedValue(Buffer.from('pdf'));
      prisma.saleOrder.findFirst.mockResolvedValue({
        customer: { email: 'venta@example.com' },
      });

      await service.sendEmail('tenant-1', 'doc-1', 'user-1', [
        'documents:manage',
      ]);

      expect(emailService.sendWithAttachment).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'venta@example.com' }),
      );
    });

    it('throws BadRequestException when the document has no file attached', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({ fileRecordId: null, fileRecord: null }),
      );

      await expect(
        service.sendEmail('tenant-1', 'doc-1', 'user-1', ['documents:manage']),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(emailService.sendWithAttachment).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no recipient can be resolved', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({ fileRecordId: 'file-1', fileRecord }),
      );

      await expect(
        service.sendEmail('tenant-1', 'doc-1', 'user-1', ['documents:manage']),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(emailService.sendWithAttachment).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the document does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.sendEmail('tenant-1', 'ghost', 'user-1', ['documents:manage']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when emailing a template without documents:templates:manage', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({
          isTemplate: true,
          templateKind: TemplateKind.SALE_CONTRACT,
          fileRecordId: 'file-1',
          fileRecord,
        }),
      );

      await expect(
        service.sendEmail('tenant-1', 'doc-1', 'user-1', ['documents:manage']),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(emailService.sendWithAttachment).not.toHaveBeenCalled();
    });
  });

  // ── archivo adjunto (plantillas DOCX) ────────────────────────────────────────

  describe('attachFile', () => {
    const uploadedFile = {
      buffer: Buffer.from('x'),
      originalname: 'plantilla.docx',
      mimetype: 'a',
      size: 1,
    };
    const fileRecord = {
      id: 'file-1',
      originalName: 'plantilla.docx',
      mimeType: 'a',
    };

    it('detects variables and stores them when the doc is a DOCX template', async () => {
      const doc = makeDoc({
        isTemplate: true,
        contentFormat: DocContentFormat.DOCX,
      });
      repo.findById.mockResolvedValue(doc);
      filesService.upload.mockResolvedValue(fileRecord);
      filesService.getFileBuffer.mockResolvedValue(Buffer.from('docx-bytes'));
      docxTemplateService.detectVariables.mockReturnValue([
        { key: 'cliente.nombre', label: 'cliente.nombre', type: 'text' },
      ]);

      await service.attachFile(
        'tenant-1',
        'doc-1',
        'user-1',
        ['documents:templates:manage'],
        uploadedFile as any,
      );

      expect(docxTemplateService.detectVariables).toHaveBeenCalledWith(
        Buffer.from('docx-bytes'),
      );
      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'doc-1', {
        fileRecordId: 'file-1',
        variables: [
          { key: 'cliente.nombre', label: 'cliente.nombre', type: 'text' },
        ],
      });
    });

    it('does not attempt variable detection for a non-DOCX or non-template document', async () => {
      repo.findById.mockResolvedValue(makeDoc({ isTemplate: false }));
      filesService.upload.mockResolvedValue(fileRecord);

      await service.attachFile(
        'tenant-1',
        'doc-1',
        'user-1',
        ['documents:manage'],
        uploadedFile as any,
      );

      expect(docxTemplateService.detectVariables).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'doc-1', {
        fileRecordId: 'file-1',
      });
    });

    it('does not fail the attach when variable detection throws', async () => {
      const doc = makeDoc({
        isTemplate: true,
        contentFormat: DocContentFormat.DOCX,
      });
      repo.findById.mockResolvedValue(doc);
      filesService.upload.mockResolvedValue(fileRecord);
      filesService.getFileBuffer.mockResolvedValue(Buffer.from('docx-bytes'));
      docxTemplateService.detectVariables.mockImplementation(() => {
        throw new Error('archivo corrupto');
      });

      await expect(
        service.attachFile(
          'tenant-1',
          'doc-1',
          'user-1',
          ['documents:templates:manage'],
          uploadedFile as any,
        ),
      ).resolves.toBeDefined();

      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'doc-1', {
        fileRecordId: 'file-1',
      });
    });
  });

  describe('detachFile', () => {
    it('clears variables when the removed file belonged to a DOCX template', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({
          isTemplate: true,
          contentFormat: DocContentFormat.DOCX,
          fileRecordId: 'file-1',
        }),
      );

      await service.detachFile('tenant-1', 'doc-1', 'user-1', [
        'documents:templates:manage',
      ]);

      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'doc-1', {
        fileRecordId: null,
        variables: Prisma.JsonNull,
      });
      expect(filesService.delete).toHaveBeenCalledWith('tenant-1', 'file-1');
    });

    it('does not touch variables for a non-DOCX document', async () => {
      repo.findById.mockResolvedValue(makeDoc({ fileRecordId: 'file-1' }));

      await service.detachFile('tenant-1', 'doc-1', 'user-1', [
        'documents:manage',
      ]);

      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'doc-1', {
        fileRecordId: null,
      });
    });
  });

  // ── generate ──────────────────────────────────────────────────────────────

  describe('generate', () => {
    const fileRecord = {
      id: 'file-1',
      originalName: 'plantilla.docx',
      mimeType: 'a',
    };

    it('fills the template, converts to PDF, uploads it and emits audit.log', async () => {
      const doc = makeDoc({
        id: 'tpl-1',
        title: 'Carta',
        isTemplate: true,
        contentFormat: DocContentFormat.DOCX,
        fileRecordId: 'file-1',
        fileRecord,
      });
      repo.findById.mockResolvedValue(doc);
      filesService.getFileBuffer.mockResolvedValue(
        Buffer.from('template-bytes'),
      );
      docxTemplateService.fillTemplate.mockReturnValue(
        Buffer.from('filled-bytes'),
      );
      docxTemplateService.convertToPdf.mockResolvedValue(
        Buffer.from('pdf-bytes'),
      );
      filesService.upload.mockResolvedValue({ id: 'generated-pdf-1' });

      const result = await service.generate(
        'tenant-1',
        'tpl-1',
        { 'cliente.nombre': 'Juan' },
        'user-1',
        ['documents:templates:manage'],
      );

      expect(docxTemplateService.fillTemplate).toHaveBeenCalledWith(
        Buffer.from('template-bytes'),
        { cliente: { nombre: 'Juan' } },
      );
      expect(docxTemplateService.convertToPdf).toHaveBeenCalledWith(
        Buffer.from('filled-bytes'),
      );
      expect(filesService.upload).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          originalname: 'Carta.pdf',
          mimetype: 'application/pdf',
        }),
        { module: 'documents', entityType: 'document', entityId: 'tpl-1' },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'document.generated',
          resourceId: 'tpl-1',
        }),
      );
      expect(result).toEqual({ fileId: 'generated-pdf-1' });
    });

    it('throws UnprocessableEntityException when the doc is not a DOCX template', async () => {
      repo.findById.mockResolvedValue(makeDoc({ isTemplate: false }));

      await expect(
        service.generate('tenant-1', 'doc-1', {}, 'user-1', [
          'documents:manage',
        ]),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(filesService.upload).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException when the template has no file attached', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({
          isTemplate: true,
          contentFormat: DocContentFormat.DOCX,
          fileRecordId: null,
          fileRecord: null,
        }),
      );

      await expect(
        service.generate('tenant-1', 'doc-1', {}, 'user-1', [
          'documents:templates:manage',
        ]),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('wraps a fill/convert failure as UnprocessableEntityException', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({
          isTemplate: true,
          contentFormat: DocContentFormat.DOCX,
          fileRecordId: 'file-1',
          fileRecord,
        }),
      );
      filesService.getFileBuffer.mockResolvedValue(
        Buffer.from('template-bytes'),
      );
      docxTemplateService.fillTemplate.mockImplementation(() => {
        throw new Error('tag inválido');
      });

      await expect(
        service.generate('tenant-1', 'doc-1', {}, 'user-1', [
          'documents:templates:manage',
        ]),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws ForbiddenException without documents:templates:manage', async () => {
      repo.findById.mockResolvedValue(
        makeDoc({
          isTemplate: true,
          contentFormat: DocContentFormat.DOCX,
          fileRecordId: 'file-1',
          fileRecord,
        }),
      );

      await expect(
        service.generate('tenant-1', 'doc-1', {}, 'user-1', [
          'documents:manage',
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('removeCategory', () => {
    it('soft-deletes category and emits audit.log', async () => {
      categoriesRepo.findById.mockResolvedValue(makeCategory());

      await service.removeCategory('tenant-1', 'cat-1', 'user-1');

      expect(categoriesRepo.softDelete).toHaveBeenCalledWith(
        'tenant-1',
        'cat-1',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          action: 'document_category.deleted',
        }),
      );
    });

    it('throws NotFoundException when category does not exist', async () => {
      categoriesRepo.findById.mockResolvedValue(null);

      await expect(
        service.removeCategory('tenant-1', 'ghost', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('InvoiceOnIssueListener', () => {
  it('does not render a second PDF for a duplicate request after the first was stored', async () => {
    const sources = {
      findInvoiceForPdf: jest.fn().mockResolvedValue({
        id: 'inv-1',
        pdfFileId: 'pdf-already-stored',
        saleOrder: {},
      }),
    };
    const filesService = { upload: jest.fn() };
    const pdfService = { renderHtmlTemplate: jest.fn() };
    const listener = new InvoiceOnIssueListener(
      sources as never,
      {} as never,
      filesService as never,
      pdfService as never,
      {} as never,
    );

    await expect(
      listener.handle({
        tenantId: 'tenant-1',
        invoiceId: 'inv-1',
        saleOrderId: 'order-1',
        total: 2500000,
        dueDate: null,
        attemptAt: new Date('2026-09-23T12:00:00.000Z'),
        expectedStatus: 'PENDING',
      }),
    ).resolves.toBeUndefined();

    expect(sources.findInvoiceForPdf).toHaveBeenCalledWith('tenant-1', 'inv-1');
    expect(pdfService.renderHtmlTemplate).not.toHaveBeenCalled();
    expect(filesService.upload).not.toHaveBeenCalled();
  });
});
