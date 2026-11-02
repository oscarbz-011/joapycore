/**
 * Integración contra PostgreSQL real: un traslado entre sucursales se emite
 * con su nota de remisión y mueve el stock en la misma transacción; anularla
 * lo devuelve, dos traslados simultáneos no sacan más de lo que hay y el
 * depósito o la nota de otra empresa no se pueden usar.
 *
 * Requiere DATABASE_URL apuntando a una base desechable con el esquema aplicado.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../src/common/events/event-bus';
import { startOfBusinessDay } from '../src/common/utils/business-date.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { BillingEventsRepository } from '../src/modules/billing/repositories/billing-events.repository';
import { BillingSeriesRepository } from '../src/modules/billing/repositories/billing-series.repository';
import { BillingSourcesRepository } from '../src/modules/billing/repositories/billing-sources.repository';
import { InvoicesRepository } from '../src/modules/billing/repositories/invoices.repository';
import { RemissionNotesRepository } from '../src/modules/billing/repositories/remission-notes.repository';
import { BillingSeriesService } from '../src/modules/billing/services/billing-series.service';
import { RemissionNotesService } from '../src/modules/billing/services/remission-notes.service';
import { ProductUnitsRepository } from '../src/modules/inventory/repositories/product-units.repository';
import { ProductsRepository } from '../src/modules/inventory/repositories/products.repository';
import { StockLocationsRepository } from '../src/modules/inventory/repositories/stock-locations.repository';
import { StockMovementsRepository } from '../src/modules/inventory/repositories/stock-movements.repository';
import { StockSourcesRepository } from '../src/modules/inventory/repositories/stock-sources.repository';
import { StockLedgerService } from '../src/modules/inventory/services/stock-ledger.service';
import { createOutbox } from './support/outbox';

const TODAY = startOfBusinessDay().toISOString().slice(0, 10);

const transport = {
  type: 'OWN' as const,
  vehicleBrand: 'Toyota',
  vehiclePlate: 'AAA123',
  carrierName: 'Electro SA',
  carrierRuc: '80000001-1',
  carrierAddress: 'Palma 500',
  driverName: 'Juan Pérez',
  driverDocument: '1234567',
  driverAddress: 'Luque',
  startDate: TODAY,
  endDate: TODAY,
};
const origin = {
  address: 'Palma 500',
  city: 'Asunción',
  department: 'Capital',
};
const destination = {
  address: 'Ruta 2 km 20',
  city: 'Capiatá',
  department: 'Central',
};

describe('RemissionNotesService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: RemissionNotesService;
  let tenantId: string;
  let otherTenantId: string;
  let branchA: string;
  let fromWarehouse: string;
  let toWarehouse: string;
  let otherWarehouse: string;
  let rice: string;
  let tv: string;
  let seriesId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const sources = new BillingSourcesRepository(prisma);
    service = new RemissionNotesService(
      prisma,
      new RemissionNotesRepository(prisma),
      new InvoicesRepository(prisma),
      sources,
      new BillingEventsRepository(prisma),
      new BillingSeriesService(new BillingSeriesRepository(prisma), sources),
      { generate: () => Promise.resolve(null) } as never,
      { getById: () => Promise.resolve({}) } as never,
      createOutbox(prisma).outbox,
      new EventBus(new EventEmitter2()),
      new StockLedgerService(
        new StockMovementsRepository(prisma),
        new ProductUnitsRepository(prisma),
        new StockLocationsRepository(prisma),
        new StockSourcesRepository(prisma),
        new ProductsRepository(prisma),
      ),
    );

    const tenant = (name: string) =>
      prisma.tenant
        .create({
          data: { name, razonSocial: 'Electro SA', ruc: '80000001-1' },
          select: { id: true },
        })
        .then((t) => t.id);
    tenantId = await tenant(`TEST nr ${randomUUID()}`);
    otherTenantId = await tenant(`TEST nr ${randomUUID()}`);
    const branch = (tenant: string, name: string) =>
      prisma.branch
        .create({ data: { tenantId: tenant, name }, select: { id: true } })
        .then((b) => b.id);
    branchA = await branch(tenantId, 'Centro');
    const branchB = await branch(tenantId, 'Capiatá');
    const warehouse = (tenant: string, branchId: string | null) =>
      prisma.warehouse
        .create({
          data: { tenantId: tenant, branchId, name: `TEST ${randomUUID()}` },
          select: { id: true },
        })
        .then((w) => w.id);
    fromWarehouse = await warehouse(tenantId, branchA);
    toWarehouse = await warehouse(tenantId, branchB);
    otherWarehouse = await warehouse(otherTenantId, null);
    const product = (name: string, isSerialized: boolean) =>
      prisma.product
        .create({
          data: {
            tenantId,
            name,
            status: 'ACTIVE',
            isSerialized,
            unit: 'unidad',
          },
          select: { id: true },
        })
        .then((p) => p.id);
    rice = await product('Arroz', false);
    tv = await product('Televisor', true);
    seriesId = (
      await prisma.billingSeries.create({
        data: {
          tenantId,
          branchId: branchA,
          documentType: 'REMISSION_NOTE',
          modality: 'SELF_PRINTED',
          timbrado: '12345678',
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
          validUntil: new Date('2099-12-31T00:00:00.000Z'),
          establecimiento: '001',
          puntoExpedicion: '003',
          rangeFrom: 1,
          rangeTo: 500,
          nextNumber: 1,
        },
        select: { id: true },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.stockMovement.createMany({
      data: [
        {
          tenantId,
          productId: rice,
          warehouseId: fromWarehouse,
          type: 'IN',
          reason: 'INITIAL',
          quantity: 10,
        },
        {
          tenantId,
          productId: tv,
          warehouseId: fromWarehouse,
          type: 'IN',
          reason: 'INITIAL',
          quantity: 2,
        },
      ],
    });
    await prisma.productUnit.createMany({
      data: ['SN-1', 'SN-2'].map((serialNumber) => ({
        tenantId,
        productId: tv,
        serialNumber: `${serialNumber}-${tenantId.slice(0, 8)}`,
        warehouseId: fromWarehouse,
        status: 'IN_STOCK' as const,
      })),
    });
  });

  const serial = (n: number) => `SN-${n}-${tenantId.slice(0, 8)}`;

  const removeDocuments = async (tenants: string[]) => {
    const where = { tenantId: { in: tenants } };
    await prisma.outboxEvent.deleteMany({ where });
    await prisma.billingDocumentEvent.deleteMany({ where });
    await prisma.remissionNoteItem.deleteMany({
      where: { remissionNote: where },
    });
    await prisma.remissionNote.deleteMany({ where });
    await prisma.invoiceItem.deleteMany({ where: { invoice: where } });
    await prisma.invoice.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.productUnit.deleteMany({ where });
    await prisma.saleOrderItem.deleteMany({ where: { saleOrder: where } });
    await prisma.saleOrder.deleteMany({ where });
    await prisma.billingSeries.updateMany({ where, data: { nextNumber: 1 } });
  };

  afterEach(() => removeDocuments([tenantId]));

  afterAll(async () => {
    if (!prisma) return;
    const tenants = [tenantId, otherTenantId].filter(Boolean);
    const where = { tenantId: { in: tenants } };
    await removeDocuments(tenants);
    await prisma.billingSeries.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.$disconnect();
  });

  const transfer = (
    items: { productId: string; quantity: number; serialNumbers?: string[] }[],
  ) => ({
    fromWarehouseId: fromWarehouse,
    toWarehouseId: toWarehouse,
    items,
    origin,
    destination,
    transport,
  });

  async function stockAt(productId: string, warehouseId: string) {
    const sum = await prisma.stockMovement.aggregate({
      where: { tenantId, productId, warehouseId },
      _sum: { quantity: true },
    });
    return sum._sum.quantity ?? 0;
  }

  it('numbers the note and moves the goods to the other branch in one go', async () => {
    const note = await service.issueTransfer(
      tenantId,
      transfer([
        { productId: rice, quantity: 4 },
        { productId: tv, quantity: 1, serialNumbers: [serial(1)] },
      ]),
    );

    expect(note).toMatchObject({
      numberPrefix: '001-003-',
      number: '0000001',
      motive: 'BRANCH_TRANSFER',
      status: 'ISSUED',
      recipientName: 'Electro SA',
      recipientDocument: 'RUC 80000001-1',
      branch: { id: branchA },
    });
    expect(note.items).toHaveLength(2);
    expect(await stockAt(rice, fromWarehouse)).toBe(6);
    expect(await stockAt(rice, toWarehouse)).toBe(4);
    expect(await stockAt(tv, toWarehouse)).toBe(1);
    const unit = await prisma.productUnit.findFirst({
      where: { tenantId, serialNumber: serial(1) },
    });
    expect(unit?.warehouseId).toBe(toWarehouse);
    const movements = await prisma.stockMovement.count({
      where: { tenantId, referenceId: note.id },
    });
    expect(movements).toBe(4);
    expect(note.events.map((e) => e.type)).toEqual(['REMISSION_NOTE_ISSUED']);
  });

  it('saves nothing when the origin does not have the goods', async () => {
    await expect(
      service.issueTransfer(
        tenantId,
        transfer([{ productId: rice, quantity: 11 }]),
      ),
    ).rejects.toThrow();

    expect(await prisma.remissionNote.count({ where: { tenantId } })).toBe(0);
    expect(await stockAt(rice, toWarehouse)).toBe(0);
    const series = await prisma.billingSeries.findUnique({
      where: { id: seriesId },
    });
    expect(series?.nextNumber).toBe(1);
  });

  it('brings the goods back when the note is voided, only once', async () => {
    const note = await service.issueTransfer(
      tenantId,
      transfer([
        { productId: rice, quantity: 4 },
        { productId: tv, quantity: 1, serialNumbers: [serial(2)] },
      ]),
    );

    const voided = await service.voidNote(tenantId, note.id, {
      reason: 'El camión no salió',
    });

    expect(voided.status).toBe('VOIDED');
    expect(await stockAt(rice, fromWarehouse)).toBe(10);
    expect(await stockAt(rice, toWarehouse)).toBe(0);
    const unit = await prisma.productUnit.findFirst({
      where: { tenantId, serialNumber: serial(2) },
    });
    expect(unit?.warehouseId).toBe(fromWarehouse);
    await expect(
      service.voidNote(tenantId, note.id, { reason: 'Otra vez' }),
    ).rejects.toThrow('ya está anulada');
  });

  it('does not let two transfers take more than there is', async () => {
    const results = await Promise.allSettled([
      service.issueTransfer(
        tenantId,
        transfer([{ productId: rice, quantity: 6 }]),
      ),
      service.issueTransfer(
        tenantId,
        transfer([{ productId: rice, quantity: 6 }]),
      ),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockAt(rice, fromWarehouse)).toBe(4);
    const numbers = await prisma.remissionNote.findMany({
      where: { tenantId },
      select: { number: true },
    });
    expect(numbers).toHaveLength(1);
  });

  it('does not use the warehouse or the note of another company', async () => {
    await expect(
      service.issueTransfer(tenantId, {
        ...transfer([{ productId: rice, quantity: 1 }]),
        toWarehouseId: otherWarehouse,
      }),
    ).rejects.toThrow('Depósito no encontrado');

    const note = await service.issueTransfer(
      tenantId,
      transfer([{ productId: rice, quantity: 1 }]),
    );
    await expect(service.findOne(otherTenantId, note.id)).rejects.toThrow(
      'no encontrada',
    );
    await expect(
      service.voidNote(otherTenantId, note.id, { reason: 'No es mía' }),
    ).rejects.toThrow('no encontrada');
    expect(await stockAt(rice, toWarehouse)).toBe(1);
  });

  describe('sale', () => {
    async function issuedInvoice() {
      const customer = await prisma.customer.create({
        data: {
          tenantId,
          firstName: 'María',
          lastName: 'Pérez',
          documentType: 'CI',
          documentNumber: '1234567',
        },
        select: { id: true },
      });
      const order = await prisma.saleOrder.create({
        data: {
          tenantId,
          customerId: customer.id,
          branchId: branchA,
          status: 'CONFIRMED',
          orderDate: new Date(),
          total: 100_000,
          items: {
            create: [
              {
                productId: rice,
                warehouseId: fromWarehouse,
                quantity: 5,
                unitPrice: 10_000,
              },
              { description: 'Flete', quantity: 1, unitPrice: 50_000 },
            ],
          },
        },
        select: { id: true, items: { select: { id: true, productId: true } } },
      });
      const riceItem = order.items.find((i) => i.productId === rice);
      const freight = order.items.find((i) => i.productId === null);
      return prisma.invoice.create({
        data: {
          tenantId,
          saleOrderId: order.id,
          status: 'ISSUED',
          total: 100_000,
          issuedAt: new Date(),
          invoicePrefix: '001-001-',
          invoiceNumber: '0000009',
          items: {
            create: [
              {
                description: 'Arroz',
                quantity: 5,
                unitPrice: 10_000,
                total: 50_000,
                saleOrderItemId: riceItem?.id,
              },
              {
                description: 'Flete',
                quantity: 1,
                unitPrice: 50_000,
                total: 50_000,
                saleOrderItemId: freight?.id,
              },
            ],
          },
        },
        select: {
          id: true,
          items: { select: { id: true, description: true } },
        },
      });
    }

    it('sends part of the goods, then the rest, without moving stock', async () => {
      const invoice = await issuedInvoice();
      const riceItem = invoice.items.find((i) => i.description === 'Arroz');
      const options = await service.saleOptions(tenantId, invoice.id);
      expect(options.recipient).toEqual({
        name: 'María Pérez',
        document: 'CI 1234567',
      });
      expect(options.items.map((i) => i.description)).toEqual(['Arroz']);

      const sale = (quantity: number) => ({
        recipientName: 'María Pérez',
        recipientDocument: 'CI 1234567',
        items: [{ invoiceItemId: riceItem?.id as string, quantity }],
        origin,
        destination,
        transport,
      });
      const first = await service.issueForSale(tenantId, invoice.id, sale(3));
      expect(first).toMatchObject({
        motive: 'SALE',
        invoice: { id: invoice.id },
      });
      await expect(
        service.issueForSale(tenantId, invoice.id, sale(3)),
      ).rejects.toThrow('quedan 2 unidades');
      await service.voidNote(tenantId, first.id, { reason: 'Se reprogramó' });
      await expect(
        service.issueForSale(tenantId, invoice.id, sale(5)),
      ).resolves.toMatchObject({
        number: '0000002',
      });

      expect(await stockAt(rice, fromWarehouse)).toBe(10);
      const history = await prisma.billingDocumentEvent.findMany({
        where: { tenantId, invoiceId: invoice.id },
        select: { type: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(history.map((h) => h.type)).toEqual([
        'REMISSION_NOTE_ISSUED',
        'VOIDED',
        'REMISSION_NOTE_ISSUED',
      ]);
    });
  });
});
