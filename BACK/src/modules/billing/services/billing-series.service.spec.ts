import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaClientOrTx } from '../../../prisma/types';
import { DEFAULT_PREPRINTED_LAYOUT } from '../utils/preprinted-layout';
import { BillingSeriesService, seriesProblem } from './billing-series.service';

const ISSUE_DAY = new Date('2026-06-15T15:00:00.000Z');
const tx = { marker: 'tx' } as unknown as PrismaClientOrTx;

function makeSeries(overrides: Record<string, unknown> = {}) {
  return {
    id: 'series-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    documentType: 'INVOICE',
    modality: 'SELF_PRINTED',
    timbrado: '12345678',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: new Date('2026-12-31T00:00:00.000Z'),
    establecimiento: '001',
    puntoExpedicion: '002',
    serieCode: '',
    rangeFrom: 1,
    rangeTo: 500,
    nextNumber: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    branch: { id: 'branch-1', name: 'Central' },
    _count: { invoices: 0 },
    ...overrides,
  };
}

const createDto = {
  branchId: 'branch-1',
  modality: 'PREPRINTED' as const,
  timbrado: '12345678',
  validFrom: '2026-01-01',
  validUntil: '2026-12-31',
  establecimiento: '001',
  puntoExpedicion: '002',
  rangeFrom: 1,
  rangeTo: 500,
};

describe('seriesProblem', () => {
  it('accepts a series valid on the issue day', () => {
    expect(seriesProblem(makeSeries() as any, ISSUE_DAY)).toBeNull();
  });

  it('accepts the last valid day until midnight in Paraguay', () => {
    const series = makeSeries({
      validUntil: new Date('2026-06-15T00:00:00.000Z'),
    });
    // 23:30 del 15/06 en Asunción = 02:30 UTC del 16/06.
    expect(
      seriesProblem(series as any, new Date('2026-06-16T02:30:00.000Z')),
    ).toBeNull();
  });

  it.each([
    [{ isActive: false }, 'desactivada'],
    [{ modality: 'ELECTRONIC' }, 'electrónica todavía no está disponible'],
    [{ timbrado: null }, 'no tiene el timbrado'],
    [{ validUntil: null }, 'no tiene el timbrado'],
    [
      { validFrom: new Date('2026-07-01T00:00:00.000Z') },
      'recién es válido desde el 01/07/2026',
    ],
    [
      { validUntil: new Date('2026-05-31T00:00:00.000Z') },
      'venció el 31/05/2026',
    ],
  ])('rejects %o', (overrides, message) => {
    expect(seriesProblem(makeSeries(overrides) as any, ISSUE_DAY)).toContain(
      message,
    );
  });
});

describe('BillingSeriesService', () => {
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findActiveForBranch: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    claimNextNumber: jest.Mock;
    advanceSuggestedNumber: jest.Mock;
    isNumberUsed: jest.Mock;
  };
  let sources: { findBranch: jest.Mock };
  let service: BillingSeriesService;

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findActiveForBranch: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn((_t, _id, data) => Promise.resolve(data)),
      claimNextNumber: jest.fn().mockResolvedValue(10),
      advanceSuggestedNumber: jest.fn().mockResolvedValue({ count: 1 }),
      isNumberUsed: jest.fn().mockResolvedValue(false),
      createVoided: jest.fn().mockResolvedValue({ id: 'voided-1' }),
      findVoided: jest.fn().mockResolvedValue([]),
    } as typeof repo;
    sources = {
      findBranch: jest
        .fn()
        .mockResolvedValue({ id: 'branch-1', name: 'Central' }),
    };
    service = new BillingSeriesService(repo as any, sources as any);
  });

  describe('create', () => {
    it('stores calendar dates and starts the series at the beginning of the range', async () => {
      await service.create('tenant-1', createDto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          documentType: 'INVOICE',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validUntil: new Date('2026-12-31T00:00:00.000Z'),
          nextNumber: 1,
        }),
      );
    });

    it('continues an already started talonario', async () => {
      await service.create('tenant-1', { ...createDto, nextNumber: 37 });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ nextNumber: 37 }),
      );
    });

    it('rejects a branch of another tenant', async () => {
      sources.findBranch.mockResolvedValue(null);

      await expect(service.create('tenant-1', createDto)).rejects.toThrow(
        'La sucursal no existe',
      );
      expect(sources.findBranch).toHaveBeenCalledWith('tenant-1', 'branch-1');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it.each([
      [{ modality: 'ELECTRONIC' as const }, 'electrónica todavía no está'],
      [{ validUntil: undefined }, 'fecha de fin de vigencia'],
      [{ validFrom: '2027-01-01' }, 'termina antes de empezar'],
      [{ rangeFrom: 600 }, 'El rango termina antes de empezar'],
      [{ nextNumber: 900 }, 'dentro del rango'],
    ])('rejects %o', async (overrides, message) => {
      await expect(
        service.create('tenant-1', { ...createDto, ...overrides }),
      ).rejects.toThrow(message);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('reports a duplicate timbrado as a conflict', async () => {
      repo.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.create('tenant-1', createDto),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('returns 404 for a series of another tenant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update('tenant-2', 'series-1', { rangeTo: 900 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findById).toHaveBeenCalledWith('tenant-2', 'series-1');
    });

    it('locks the numbering of a series that already numbered invoices', async () => {
      repo.findById.mockResolvedValue(makeSeries({ _count: { invoices: 3 } }));

      await expect(
        service.update('tenant-1', 'series-1', { timbrado: '87654321' }),
      ).rejects.toThrow('solo se puede cambiar el fin de vigencia');
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('lets a used series extend its range and validity or be deactivated', async () => {
      repo.findById.mockResolvedValue(makeSeries({ _count: { invoices: 3 } }));

      await service.update('tenant-1', 'series-1', {
        rangeTo: 900,
        validUntil: '2027-03-31',
        isActive: false,
        timbrado: '12345678',
      });

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        expect.objectContaining({
          rangeTo: 900,
          validUntil: new Date('2027-03-31T00:00:00.000Z'),
          isActive: false,
          nextNumber: 10,
        }),
      );
    });

    it('lets a migrated series complete the timbrado it was missing', async () => {
      repo.findById.mockResolvedValue(
        makeSeries({
          timbrado: null,
          validFrom: null,
          validUntil: null,
          _count: { invoices: 12 },
        }),
      );

      await service.update('tenant-1', 'series-1', {
        timbrado: '12345678',
        validFrom: '2026-01-01',
        validUntil: '2026-12-31',
      });

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        expect.objectContaining({ timbrado: '12345678' }),
      );
    });

    it('does not let the range end before the last used number', async () => {
      repo.findById.mockResolvedValue(
        makeSeries({ nextNumber: 120, _count: { invoices: 3 } }),
      );

      await expect(
        service.update('tenant-1', 'series-1', { rangeTo: 100 }),
      ).rejects.toThrow('último número usado (119)');
    });
  });

  describe('numberForIssue', () => {
    const params = { branchId: 'branch-1', at: ISSUE_DAY };

    it('uses the only valid series of the branch and claims its next number', async () => {
      repo.findActiveForBranch.mockResolvedValue([makeSeries()]);

      const numbering = await service.numberForIssue('tenant-1', params, tx);

      expect(repo.findActiveForBranch).toHaveBeenCalledWith(
        'tenant-1',
        'branch-1',
        'INVOICE',
        tx,
      );
      expect(repo.claimNextNumber).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        tx,
      );
      expect(numbering).toEqual({
        seriesId: 'series-1',
        modality: 'SELF_PRINTED',
        timbrado: '12345678',
        timbradoValidFrom: new Date('2026-01-01T00:00:00.000Z'),
        timbradoValidUntil: new Date('2026-12-31T00:00:00.000Z'),
        serieCode: '',
        establecimiento: '001',
        puntoExpedicion: '002',
        sequential: 10,
        invoiceNumber: '0000010',
        invoicePrefix: '001-002-',
      });
    });

    it('ignores expired series when another one is valid', async () => {
      repo.findActiveForBranch.mockResolvedValue([
        makeSeries({
          id: 'old',
          validUntil: new Date('2025-12-31T00:00:00.000Z'),
        }),
        makeSeries(),
      ]);

      await service.numberForIssue('tenant-1', params, tx);

      expect(repo.claimNextNumber).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        tx,
      );
    });

    it('asks to choose when the branch has more than one valid series', async () => {
      repo.findActiveForBranch.mockResolvedValue([
        makeSeries(),
        makeSeries({ id: 'series-2', puntoExpedicion: '003' }),
      ]);

      await expect(
        service.numberForIssue('tenant-1', params, tx),
      ).rejects.toThrow('elegí con cuál facturar');
    });

    it('explains why the only series cannot be used', async () => {
      repo.findActiveForBranch.mockResolvedValue([
        makeSeries({ timbrado: null }),
      ]);

      await expect(
        service.numberForIssue('tenant-1', params, tx),
      ).rejects.toThrow('no tiene el timbrado');
    });

    it('names the branch when it has no series', async () => {
      await expect(
        service.numberForIssue('tenant-1', params, tx),
      ).rejects.toThrow(
        'No hay una serie de facturas vigente para la sucursal Central',
      );
    });

    it('rejects a chosen series of another branch or tenant', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.numberForIssue(
          'tenant-1',
          { ...params, seriesId: 'foreign' },
          tx,
        ),
      ).rejects.toThrow('no corresponde a la sucursal');
      expect(repo.findById).toHaveBeenCalledWith('tenant-1', 'foreign', tx);
    });

    it('reports an exhausted range', async () => {
      repo.findActiveForBranch.mockResolvedValue([makeSeries()]);
      repo.claimNextNumber.mockResolvedValue(null);

      await expect(
        service.numberForIssue('tenant-1', params, tx),
      ).rejects.toThrow('Se agotó el rango autorizado');
    });

    describe('talonario de imprenta', () => {
      beforeEach(() => {
        repo.findActiveForBranch.mockResolvedValue([
          makeSeries({ modality: 'PREPRINTED' }),
        ]);
      });

      it('requires the number of the talonario', async () => {
        await expect(
          service.numberForIssue('tenant-1', params, tx),
        ).rejects.toThrow('Cargá el número del talonario');
      });

      it('uses the typed number and advances the suggested one', async () => {
        const numbering = await service.numberForIssue(
          'tenant-1',
          { ...params, documentNumber: 41 },
          tx,
        );

        expect(numbering.sequential).toBe(41);
        expect(repo.claimNextNumber).not.toHaveBeenCalled();
        expect(repo.advanceSuggestedNumber).toHaveBeenCalledWith(
          'tenant-1',
          'series-1',
          41,
          tx,
        );
      });

      it('rejects a number outside the talonario', async () => {
        await expect(
          service.numberForIssue(
            'tenant-1',
            { ...params, documentNumber: 501 },
            tx,
          ),
        ).rejects.toThrow('fuera del rango del talonario (1 a 500)');
      });

      it('rejects a number already used in the series', async () => {
        repo.isNumberUsed.mockResolvedValue(true);

        await expect(
          service.numberForIssue(
            'tenant-1',
            { ...params, documentNumber: 41 },
            tx,
          ),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
        expect(repo.isNumberUsed).toHaveBeenCalledWith('series-1', '', 41, tx);
      });
    });
  });

  describe('numberForAutomatic', () => {
    it('numbers with the self-printed series of the branch', async () => {
      repo.findActiveForBranch.mockResolvedValue([
        makeSeries({ id: 'talonario', modality: 'PREPRINTED' }),
        makeSeries(),
      ]);

      const numbering = await service.numberForAutomatic(
        'tenant-1',
        'branch-1',
        ISSUE_DAY,
        tx,
      );

      expect(numbering?.seriesId).toBe('series-1');
    });

    it('leaves the invoice unnumbered when the branch only has a talonario', async () => {
      repo.findActiveForBranch.mockResolvedValue([
        makeSeries({ modality: 'PREPRINTED' }),
      ]);

      await expect(
        service.numberForAutomatic('tenant-1', 'branch-1', ISSUE_DAY, tx),
      ).resolves.toBeNull();
      expect(repo.claimNextNumber).not.toHaveBeenCalled();
    });

    // Sin esto, el error deshacía la transacción del recibo y la factura de
    // interés no llegaba a existir.
    it('leaves the invoice unnumbered when the range is used up', async () => {
      repo.findActiveForBranch.mockResolvedValue([makeSeries()]);
      repo.claimNextNumber.mockResolvedValue(null);

      await expect(
        service.numberForAutomatic('tenant-1', 'branch-1', ISSUE_DAY, tx),
      ).resolves.toBeNull();
    });
  });

  describe('print layout of a talonario', () => {
    it('always returns the full layout, the standard one when the series has none', async () => {
      repo.findById.mockResolvedValue(makeSeries({ printLayout: null }));
      const series = await service.findOne('tenant-1', 'series-1');
      expect(series.printLayout).toEqual(DEFAULT_PREPRINTED_LAYOUT);
    });

    it('stores the calibrated layout and resets it with null', async () => {
      repo.findById.mockResolvedValue(
        makeSeries({ modality: 'PREPRINTED', printLayout: null }),
      );
      const layout = { ...DEFAULT_PREPRINTED_LAYOUT, offsetX: 3 };

      await service.update('tenant-1', 'series-1', { printLayout: layout });
      expect(repo.update).toHaveBeenLastCalledWith(
        'tenant-1',
        'series-1',
        expect.objectContaining({ printLayout: layout }),
      );

      await service.update('tenant-1', 'series-1', { printLayout: null });
      expect(repo.update).toHaveBeenLastCalledWith(
        'tenant-1',
        'series-1',
        expect.objectContaining({ printLayout: Prisma.DbNull }),
      );
    });

    it('lets a used series change its layout', async () => {
      repo.findById.mockResolvedValue(
        makeSeries({
          modality: 'PREPRINTED',
          printLayout: null,
          _count: { invoices: 3 },
        }),
      );
      await expect(
        service.update('tenant-1', 'series-1', {
          printLayout: DEFAULT_PREPRINTED_LAYOUT,
        }),
      ).resolves.toBeDefined();
    });

    it('checks whether the items fit on the sheet', async () => {
      repo.findById.mockResolvedValue(
        makeSeries({
          modality: 'PREPRINTED',
          printLayout: { items: { maxLines: 2 } },
        }),
      );
      await expect(
        service.formFitProblem('tenant-1', 'series-1', 2, tx),
      ).resolves.toBeNull();
      await expect(
        service.formFitProblem('tenant-1', 'series-1', 3, tx),
      ).resolves.toMatch(/admite 2/);
    });
  });

  describe('voided sheets', () => {
    const talonario = makeSeries({ modality: 'PREPRINTED', nextNumber: 42 });

    it('moves an invoice to the next suggested sheet', async () => {
      repo.findById.mockResolvedValue(talonario);

      const numbering = await service.numberForPreprintedSheet(
        'tenant-1',
        { seriesId: 'series-1', at: ISSUE_DAY },
        tx,
      );

      expect(numbering).toMatchObject({
        sequential: 42,
        invoiceNumber: '0000042',
      });
      expect(repo.advanceSuggestedNumber).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        42,
        tx,
      );
    });

    it('does not reuse a sheet already used or voided', async () => {
      repo.findById.mockResolvedValue(talonario);
      repo.isNumberUsed.mockResolvedValue(true);

      await expect(
        service.numberForPreprintedSheet(
          'tenant-1',
          { seriesId: 'series-1', documentNumber: 41, at: ISSUE_DAY },
          tx,
        ),
      ).rejects.toThrow(
        'El número 41 del talonario ya fue usado o inutilizado',
      );
    });

    it('only voids sheets of a printing-house talonario', async () => {
      repo.findById.mockResolvedValue(makeSeries());
      await expect(
        service.voidLooseSheet(
          'tenant-1',
          'series-1',
          { documentNumber: 5, reason: 'Extraviada' },
          tx,
        ),
      ).rejects.toThrow('Solo se inutilizan hojas de un talonario de imprenta');
    });

    it('voids a blank sheet and moves the suggestion past it', async () => {
      repo.findById.mockResolvedValue(talonario);

      await service.voidLooseSheet(
        'tenant-1',
        'series-1',
        {
          documentNumber: 42,
          reason: '  Extraviada ',
          scanFileId: 'file-1',
          userId: 'user-1',
        },
        tx,
      );

      expect((repo as any).createVoided).toHaveBeenCalledWith(
        {
          tenantId: 'tenant-1',
          seriesId: 'series-1',
          serieCode: '',
          sequential: 42,
          invoiceId: null,
          reason: 'Extraviada',
          scanFileId: 'file-1',
          voidedById: 'user-1',
        },
        tx,
      );
      expect(repo.advanceSuggestedNumber).toHaveBeenCalledWith(
        'tenant-1',
        'series-1',
        42,
        tx,
      );
    });

    it('rejects a sheet outside the range of the talonario', async () => {
      repo.findById.mockResolvedValue(talonario);
      await expect(
        service.voidLooseSheet(
          'tenant-1',
          'series-1',
          { documentNumber: 900, reason: 'Extraviada' },
          tx,
        ),
      ).rejects.toThrow('fuera del rango');
      expect((repo as any).createVoided).not.toHaveBeenCalled();
    });

    it('does not list the voided sheets of a series of another tenant', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.findVoided('tenant-2', 'series-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
