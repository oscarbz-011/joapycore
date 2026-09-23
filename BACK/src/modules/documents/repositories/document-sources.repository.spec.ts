import { DocumentSourcesRepository } from './document-sources.repository';

describe('DocumentSourcesRepository invoice PDF link', () => {
  it('links only the same pending issuance attempt with no prior PDF', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new DocumentSourcesRepository({
      invoice: { updateMany },
    } as never);
    const attemptAt = new Date('2026-09-23T12:01:00.000Z');

    await (repository as any).setInvoicePdf(
      'tenant-1',
      'inv-1',
      'pdf-1',
      attemptAt,
      'PENDING',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'inv-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        pdfFileId: null,
        issuedAt: attemptAt,
      }),
      data: { pdfFileId: 'pdf-1' },
    });
  });

  it('rejects a stale renderer when the conditional link updates no invoice', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = new DocumentSourcesRepository({
      invoice: { updateMany },
    } as never);

    await expect(
      (repository as any).setInvoicePdf(
        'tenant-1',
        'inv-1',
        'pdf-stale',
        new Date('2026-09-23T12:01:00.000Z'),
        'PENDING',
      ),
    ).rejects.toThrow();
  });
});
