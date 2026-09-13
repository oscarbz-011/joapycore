import { NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FilesService } from './files.service';

function makeMulterFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    originalname: 'contrato.pdf',
    mimetype: 'application/pdf',
    size: 4,
    buffer: Buffer.from('test'),
    ...overrides,
  } as Express.Multer.File;
}

function makeFileRecord(overrides = {}) {
  return {
    id: 'file-1',
    tenantId: 'tenant-1',
    module: 'hr',
    entityType: 'employee',
    entityId: 'emp-1',
    bucket: 'local',
    key: 'tenant-1/hr/employee/emp-1/uuid.pdf',
    originalName: 'contrato.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4,
    uploadedBy: 'user-1',
    url: null,
    checksum: 'abc',
    visibility: 'PRIVATE',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('FilesService', () => {
  let service: FilesService;
  let filesRepository: {
    create: jest.Mock;
    findById: jest.Mock;
    findByEntity: jest.Mock;
    delete: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let localDriver: {
    put: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
    exists: jest.Mock;
    getSignedUrl: jest.Mock;
  };
  let s3Driver: {
    put: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
    exists: jest.Mock;
    getSignedUrl: jest.Mock;
  };
  let drivers: Map<string, unknown>;

  beforeEach(() => {
    filesRepository = {
      create: jest
        .fn()
        .mockImplementation((data) =>
          Promise.resolve({ id: 'file-1', ...data }),
        ),
      findById: jest.fn(),
      findByEntity: jest.fn(),
      delete: jest.fn(),
    };
    configService = { get: jest.fn().mockReturnValue('local') };
    localDriver = {
      put: jest.fn().mockResolvedValue({ key: 'x', size: 4 }),
      get: jest.fn().mockResolvedValue(Buffer.from('local-bytes')),
      delete: jest.fn(),
      exists: jest.fn(),
      getSignedUrl: jest.fn().mockResolvedValue('/local/url'),
    };
    s3Driver = {
      put: jest.fn().mockResolvedValue({ key: 'x', size: 4 }),
      get: jest.fn().mockResolvedValue(Buffer.from('s3-bytes')),
      delete: jest.fn(),
      exists: jest.fn(),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://s3.example.com/signed'),
    };
    drivers = new Map([
      ['local', localDriver],
      ['s3', s3Driver],
    ]);

    service = new FilesService(
      filesRepository as any,
      configService as any,
      drivers as any,
    );
  });

  describe('upload', () => {
    it('builds the key as tenantId/module/entityType/entityId/<uuid>.<ext> and uses the currently configured driver', async () => {
      const file = makeMulterFile();

      const result = await service.upload('tenant-1', 'user-1', file, {
        module: 'hr',
        entityType: 'employee',
        entityId: 'emp-1',
      });

      expect(localDriver.put).toHaveBeenCalledWith(
        expect.stringMatching(
          /^tenant-1\/hr\/employee\/emp-1\/[0-9a-f-]+\.pdf$/,
        ),
        file.buffer,
        { contentType: 'application/pdf' },
      );
      expect(s3Driver.put).not.toHaveBeenCalled();
      expect(result.bucket).toBe('local');
      expect(filesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          bucket: 'local',
          module: 'hr',
          entityType: 'employee',
          entityId: 'emp-1',
        }),
      );
    });

    it('falls back to "general" when entityId is omitted', async () => {
      await service.upload('tenant-1', 'user-1', makeMulterFile(), {
        module: 'hr',
        entityType: 'employee',
      });

      expect(localDriver.put).toHaveBeenCalledWith(
        expect.stringMatching(
          /^tenant-1\/hr\/employee\/general\/[0-9a-f-]+\.pdf$/,
        ),
        expect.anything(),
        expect.anything(),
      );
    });

    it('computes a SHA-256 checksum of the file buffer', async () => {
      const file = makeMulterFile();
      const expectedChecksum = createHash('sha256')
        .update(file.buffer)
        .digest('hex');

      await service.upload('tenant-1', 'user-1', file, {
        module: 'hr',
        entityType: 'employee',
      });

      expect(filesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ checksum: expectedChecksum }),
      );
    });

    it('uses the s3 driver and records bucket="s3" when STORAGE_DRIVER=s3', async () => {
      configService.get.mockReturnValue('s3');

      const result = await service.upload(
        'tenant-1',
        'user-1',
        makeMulterFile(),
        {
          module: 'hr',
          entityType: 'employee',
        },
      );

      expect(s3Driver.put).toHaveBeenCalled();
      expect(localDriver.put).not.toHaveBeenCalled();
      expect(result.bucket).toBe('s3');
    });
  });

  describe('getFileBuffer / getSignedDownloadUrl / delete — dispatch by record.bucket', () => {
    it('reads from the local driver for a record with bucket="local", even if STORAGE_DRIVER is now "s3"', async () => {
      configService.get.mockReturnValue('s3'); // tenant switched drivers after this file was uploaded
      const record = makeFileRecord({ bucket: 'local' });

      const buffer = await service.getFileBuffer(record as any);

      expect(buffer.toString()).toBe('local-bytes');
      expect(localDriver.get).toHaveBeenCalledWith(record.key);
      expect(s3Driver.get).not.toHaveBeenCalled();
    });

    it('gets a signed URL from the s3 driver for a record with bucket="s3"', async () => {
      const record = makeFileRecord({ bucket: 's3' });

      const url = await service.getSignedDownloadUrl(record as any);

      expect(url).toBe('https://s3.example.com/signed');
      // Las cabeceras de respuesta evitan que el bucket sirva HTML/SVG
      // renderizable con el tipo con que se subió.
      expect(s3Driver.getSignedUrl).toHaveBeenCalledWith(
        record.key,
        300,
        expect.objectContaining({
          contentDisposition: expect.stringMatching(/^(inline|attachment); filename=/),
        }),
      );
    });

    it("delete() removes the object from the record's own driver and then the DB row", async () => {
      filesRepository.findById.mockResolvedValue(
        makeFileRecord({ bucket: 'local' }),
      );

      await service.delete('tenant-1', 'file-1');

      expect(localDriver.delete).toHaveBeenCalledWith(
        'tenant-1/hr/employee/emp-1/uuid.pdf',
      );
      expect(filesRepository.delete).toHaveBeenCalledWith('tenant-1', 'file-1');
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when the record does not exist', async () => {
      filesRepository.findById.mockResolvedValue(null);

      await expect(service.getById('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
