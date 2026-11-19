import { CustomersRepository } from '../repositories/customers.repository';
import { SalesOnLocationCorrectedListener } from './sales-on-location-corrected.listener';

describe('SalesOnLocationCorrectedListener', () => {
  it('saves the location only if it is newer than the stored one', async () => {
    const prisma = {
      customer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const listener = new SalesOnLocationCorrectedListener(
      new CustomersRepository(prisma as any),
    );

    await listener.handle({
      tenantId: 'tenant-1',
      deliveryNoteId: 'note-1',
      customerId: 'cust-1',
      latitude: -25.3,
      longitude: -57.6,
      correctedAt: '2026-11-18T10:00:00.000Z',
    });

    const correctedAt = new Date('2026-11-18T10:00:00.000Z');
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cust-1',
        tenantId: 'tenant-1',
        OR: [
          { locationUpdatedAt: null },
          { locationUpdatedAt: { lt: correctedAt } },
        ],
      },
      data: {
        latitude: -25.3,
        longitude: -57.6,
        locationUpdatedAt: correctedAt,
      },
    });
  });
});
