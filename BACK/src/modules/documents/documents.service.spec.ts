import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DocType, DocVisibility } from '@prisma/client';
import { DocumentsService } from './services/documents.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<ReturnType<typeof makeDoc>> = {}) {
  return {
    id: 'doc-1',
    tenantId: 'tenant-1',
    type: DocType.INTERNAL,
    title: 'Test doc',
    description: null,
    category: 'Legal',
    tags: [],
    visibility: DocVisibility.PUBLIC,
    allowedRoles: [] as string[],
    fileUrl: null,
    fileName: null,
    fileSizeBytes: null,
    mimeType: null,
    entityType: null,
    entityId: null,
    expiresAt: null,
    content: null,
    uploadedById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
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
    create: jest.Mock;
    update: jest.Mock;
    softDelete: jest.Mock;
    findCategories: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ count: 1 }),
      softDelete: jest.fn().mockResolvedValue({ count: 1 }),
      findCategories: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };
    service = new DocumentsService(repo as any, eventEmitter as any);
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns PUBLIC docs for any user', async () => {
      repo.findAll.mockResolvedValue([makeDoc({ visibility: DocVisibility.PUBLIC })]);

      const result = await service.findAll('tenant-1', {}, [], []);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('doc-1');
    });

    it('hides PRIVATE docs when user lacks documents:manage', async () => {
      repo.findAll.mockResolvedValue([makeDoc({ visibility: DocVisibility.PRIVATE })]);

      const result = await service.findAll('tenant-1', {}, [], ['documents:read']);

      expect(result).toHaveLength(0);
    });

    it('shows PRIVATE docs when user has documents:manage', async () => {
      repo.findAll.mockResolvedValue([makeDoc({ visibility: DocVisibility.PRIVATE })]);

      const result = await service.findAll('tenant-1', {}, [], ['documents:manage']);

      expect(result).toHaveLength(1);
    });

    it('shows ROLE_BASED doc when user has a matching role', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ visibility: DocVisibility.ROLE_BASED, allowedRoles: ['Admin', 'Supervisor'] }),
      ]);

      const result = await service.findAll('tenant-1', {}, ['Supervisor'], []);

      expect(result).toHaveLength(1);
    });

    it('hides ROLE_BASED doc when user has no matching role', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ visibility: DocVisibility.ROLE_BASED, allowedRoles: ['Admin'] }),
      ]);

      const result = await service.findAll('tenant-1', {}, ['Staff'], []);

      expect(result).toHaveLength(0);
    });

    it('shows ROLE_BASED doc to documents:manage even without matching role', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ visibility: DocVisibility.ROLE_BASED, allowedRoles: ['Admin'] }),
      ]);

      const result = await service.findAll('tenant-1', {}, ['Staff'], ['documents:manage']);

      expect(result).toHaveLength(1);
    });

    it('filters multiple docs with mixed visibility', async () => {
      repo.findAll.mockResolvedValue([
        makeDoc({ id: 'doc-pub', visibility: DocVisibility.PUBLIC }),
        makeDoc({ id: 'doc-priv', visibility: DocVisibility.PRIVATE }),
        makeDoc({ id: 'doc-role', visibility: DocVisibility.ROLE_BASED, allowedRoles: ['Admin'] }),
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
      repo.findById.mockResolvedValue(makeDoc({ visibility: DocVisibility.PRIVATE }));

      await expect(
        service.findOne('tenant-1', 'doc-1', [], ['documents:read']),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns PRIVATE doc for documents:manage holder', async () => {
      repo.findById.mockResolvedValue(makeDoc({ visibility: DocVisibility.PRIVATE }));

      const result = await service.findOne('tenant-1', 'doc-1', [], ['documents:manage']);

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
        { type: DocType.INTERNAL, title: 'Test', visibility: DocVisibility.PUBLIC },
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', uploadedById: 'user-1' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'document.created',
        resourceId: created.id,
      }));
      expect(result.id).toBe('doc-1');
    });

    it('throws BadRequestException when ROLE_BASED with no allowedRoles', async () => {
      await expect(
        service.create(
          'tenant-1',
          { type: DocType.INTERNAL, title: 'Secret', visibility: DocVisibility.ROLE_BASED },
          'user-1',
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
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates ROLE_BASED doc when allowedRoles is provided', async () => {
      repo.create.mockResolvedValue(makeDoc({ visibility: DocVisibility.ROLE_BASED, allowedRoles: ['Admin'] }));

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
        ),
      ).resolves.toBeDefined();
    });

    it('converts expiresAt string to Date before saving', async () => {
      const isoDate = '2026-12-31T00:00:00.000Z';
      repo.create.mockResolvedValue(makeDoc());

      await service.create(
        'tenant-1',
        { type: DocType.CONTRACT, title: 'Expiring', visibility: DocVisibility.PUBLIC, expiresAt: isoDate },
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: new Date(isoDate) }),
      );
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates doc and emits audit.log', async () => {
      const existing = makeDoc();
      repo.findById.mockResolvedValueOnce(existing).mockResolvedValueOnce({ ...existing, title: 'Updated' });

      const result = await service.update('tenant-1', 'doc-1', { title: 'Updated' }, 'user-1');

      expect(repo.update).toHaveBeenCalledWith('tenant-1', 'doc-1', expect.objectContaining({ title: 'Updated' }));
      expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.objectContaining({
        action: 'document.updated',
        before: existing,
      }));
      expect(result?.title).toBe('Updated');
    });

    it('throws NotFoundException when doc does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'ghost', { title: 'X' }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when changing to ROLE_BASED with no roles', async () => {
      repo.findById.mockResolvedValue(makeDoc());

      await expect(
        service.update('tenant-1', 'doc-1', { visibility: DocVisibility.ROLE_BASED, allowedRoles: [] }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes doc and emits audit.log', async () => {
      repo.findById.mockResolvedValue(makeDoc());

      await service.remove('tenant-1', 'doc-1', 'user-1');

      expect(repo.softDelete).toHaveBeenCalledWith('tenant-1', 'doc-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('audit.log', expect.objectContaining({
        action: 'document.deleted',
        resourceId: 'doc-1',
      }));
    });

    it('throws NotFoundException when doc does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.remove('tenant-1', 'ghost', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  // ── getCategories ─────────────────────────────────────────────────────────

  describe('getCategories', () => {
    it('returns non-null categories from repo', async () => {
      repo.findCategories.mockResolvedValue([
        { category: 'Legal' },
        { category: 'Finanzas' },
        { category: null },
      ]);

      const result = await service.getCategories('tenant-1');

      expect(result).toEqual(['Legal', 'Finanzas']);
    });

    it('returns empty array when no categories exist', async () => {
      repo.findCategories.mockResolvedValue([]);

      const result = await service.getCategories('tenant-1');

      expect(result).toEqual([]);
    });
  });
});
