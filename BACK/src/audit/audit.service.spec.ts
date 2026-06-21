import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let repo: { findAll: jest.Mock };

  beforeEach(() => {
    repo = { findAll: jest.fn() };
    service = new AuditService(repo as any);
  });

  describe('findAll', () => {
    it('delegates to repository with tenantId and filters', () => {
      const filters = { module: 'sales', page: 1, limit: 20 };
      repo.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      service.findAll('tenant-1', filters as any);
      expect(repo.findAll).toHaveBeenCalledWith('tenant-1', filters);
    });
  });
});
