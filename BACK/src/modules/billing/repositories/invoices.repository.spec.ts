import { InvoicesRepository } from './invoices.repository';

describe('InvoicesRepository issuance claim', () => {
  it('claims only the observed pending version without a PDF', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new InvoicesRepository({
      invoice: { updateMany },
    } as never);
    const observedAt = new Date('2026-09-23T12:00:00.000Z');
    const attemptAt = new Date('2026-09-23T12:01:00.000Z');

    await (repository as any).claimIssue(
      'tenant-1',
      'inv-1',
      observedAt,
      attemptAt,
      { paymentMethod: 'CASH' },
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        pdfFileId: null,
        updatedAt: observedAt,
      }),
      data: expect.objectContaining({
        issuedAt: attemptAt,
        paymentMethod: 'CASH',
      }),
    });
    const where = updateMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { issuedAt: null },
        { issuedAt: { lt: expect.any(Date) } },
      ]),
    );
  });

  it('releases only the same attempt while the PDF link is still empty', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new InvoicesRepository({
      invoice: { updateMany },
    } as never);
    const attemptAt = new Date('2026-09-23T12:01:00.000Z');

    await (repository as any).releaseIssueClaim('tenant-1', 'inv-1', attemptAt);

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        pdfFileId: null,
        issuedAt: attemptAt,
      }),
      data: expect.objectContaining({ issuedAt: null }),
    });
  });

  it('cancels a pending invoice only at its observed version without a live claim', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new InvoicesRepository({
      invoice: { updateMany },
    } as never);
    const observedAt = new Date('2026-09-23T12:00:00.000Z');

    await repository.cancelIfAllowed(
      'tenant-1',
      'inv-1',
      'PENDING',
      observedAt,
      new Date('2026-09-23T12:10:00.000Z'),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        updatedAt: observedAt,
        OR: [
          { issuedAt: null },
          { issuedAt: { lt: new Date('2026-09-23T12:05:00.000Z') } },
        ],
      }),
      data: { status: 'CANCELLED' },
    });
  });
});
