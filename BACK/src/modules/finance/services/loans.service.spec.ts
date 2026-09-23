import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayInstallmentDto } from '../dto/pay-installment.dto';
import { PaymentMethod } from '@prisma/client';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { FinanceSourcesRepository } from '../repositories/finance-sources.repository';
import { PaymentReceiptsRepository } from '../repositories/payment-receipts.repository';
import { LoansService } from './loans.service';
import { InstallmentsSchedulerService } from './installments-scheduler.service';

const TENANT = 'tenant-1';
const ORDER_ID = 'order-1';
const LOAN_ID = 'loan-1';
const INST_ID = 'installment-1';

const mockLoan = {
  id: LOAN_ID,
  tenantId: TENANT,
  saleOrderId: ORDER_ID,
  customerId: 'customer-1',
  principal: 1000,
  interestRate: 10,
  totalAmount: 1100,
  totalInstallments: 2,
  status: 'ACTIVE',
  installments: [
    { id: INST_ID, number: 1, amount: 550, paidAmount: 0, status: 'PENDING' },
    { id: 'inst-2', number: 2, amount: 550, paidAmount: 0, status: 'PENDING' },
  ],
};

const mockOrder = {
  id: ORDER_ID,
  tenantId: TENANT,
  customerId: 'customer-1',
  saleType: 'CREDIT',
  installments: 2,
  interestRate: { toNumber: () => 10 },
  items: [
    { productId: 'prod-1', quantity: 2, unitPrice: { toNumber: () => 500 } },
  ],
};

describe('LoansService', () => {
  let service: LoansService;
  let loansRepo: jest.Mocked<LoansRepository>;
  let installmentsRepo: jest.Mocked<InstallmentsRepository>;
  let prisma: jest.Mocked<PrismaService>;
  let eventEmitter: { emit: jest.Mock; emitAsync: jest.Mock };
  let installmentCreateMock: jest.Mock;
  let installmentUpdateMock: jest.Mock;
  let paymentReceiptCreateMock: jest.Mock;
  let paymentReceiptFindFirstMock: jest.Mock;
  let branchFindUniqueMock: jest.Mock;
  let topLevelPaymentReceiptFindFirstMock: jest.Mock;
  let installmentsScheduler: { refreshLoanCharges: jest.Mock };

  beforeEach(async () => {
    installmentCreateMock = jest.fn().mockResolvedValue({});
    installmentUpdateMock = jest.fn().mockResolvedValue({});
    paymentReceiptCreateMock = jest
      .fn()
      .mockResolvedValue({ id: 'receipt-1', receiptNumber: '001-001-0000001' });
    paymentReceiptFindFirstMock = jest.fn().mockResolvedValue(null);
    branchFindUniqueMock = jest.fn().mockResolvedValue(null);
    // findReceiptById() re-consulta el recibo fuera de la transacción (para
    // devolver pdfFileId ya generado por el listener tras el emitAsync) — usa
    // this.prisma.paymentReceipt.findFirst directamente, no el de la tx.
    topLevelPaymentReceiptFindFirstMock = jest
      .fn()
      .mockResolvedValue({ id: 'receipt-1', receiptNumber: '001-001-0000001' });
    const mockPrisma = {
      saleOrder: { findFirst: jest.fn() },
      loan: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
      },
      installment: { create: jest.fn() },
      paymentReceipt: { findFirst: topLevelPaymentReceiptFindFirstMock },
      creditConfig: {
        findUnique: jest.fn().mockResolvedValue({ dueDayOfMonth: 5 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            loan: {
              create: jest.fn().mockResolvedValue({ id: LOAN_ID }),
              findUniqueOrThrow: jest.fn().mockResolvedValue(mockLoan),
            },
            installment: {
              create: installmentCreateMock,
              update: installmentUpdateMock,
            },
            branch: { findFirst: branchFindUniqueMock },
            paymentReceipt: {
              findFirst: paymentReceiptFindFirstMock,
              create: paymentReceiptCreateMock,
            },
          }),
        ),
    };

    const realLoansRepo = new LoansRepository(mockPrisma as any);
    const realInstallmentsRepo = new InstallmentsRepository(mockPrisma as any);

    const mockLoansRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findBySaleOrder: jest.fn(),
      create: jest.fn(),
      updateContractUrl: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({}),
      // Implementación real sobre los mocks de Prisma/tx.
      createBare: jest.fn((data: any, client: any) =>
        realLoansRepo.createBare(data, client),
      ),
      findWithSchedule: jest.fn((id: string, client: any) =>
        realLoansRepo.findWithSchedule(id, client),
      ),
      findScheduleBySaleOrder: jest.fn((tenantId: string, orderId: string) =>
        realLoansRepo.findScheduleBySaleOrder(tenantId, orderId),
      ),
    };

    const mockInstallmentsRepo = {
      findByLoan: jest.fn(),
      findById: jest.fn(),
      findOverdue: jest.fn(),
      findPendingByLoan: jest.fn(),
      update: jest.fn(),
      // Sin recargos vigentes por default — los tests de mora los sobrescriben.
      findOpenChargesByInstallments: jest.fn().mockResolvedValue([]),
      updateChargeAmount: jest.fn().mockResolvedValue({}),
      // Implementación real sobre el tx mockeado.
      create: jest.fn((data: any, client: any) =>
        realInstallmentsRepo.create(data, client),
      ),
    };
    mockInstallmentsRepo.update = jest.fn(
      (id: string, data: any, client: any) =>
        realInstallmentsRepo.update(id, data, client),
    );

    const mockEventEmitter = {
      emit: jest.fn(),
      emitAsync: jest.fn().mockResolvedValue([]),
    };
    installmentsScheduler = {
      refreshLoanCharges: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoansRepository, useValue: mockLoansRepo },
        { provide: InstallmentsRepository, useValue: mockInstallmentsRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        PaymentReceiptsRepository,
        FinanceSourcesRepository,
        {
          provide: InstallmentsSchedulerService,
          useValue: installmentsScheduler,
        },
      ],
    }).compile();

    service = module.get(LoansService);
    loansRepo = module.get(LoansRepository);
    installmentsRepo = module.get(InstallmentsRepository);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('findOne', () => {
    it('returns loan when found', async () => {
      loansRepo.findById.mockResolvedValue(mockLoan as never);
      const result = await service.findOne(TENANT, LOAN_ID);
      expect(result).toMatchObject(mockLoan);
      expect(result.moraPolicy).toEqual({ graceDays: 0, components: [] });
      expect(loansRepo.findById).toHaveBeenCalledWith(TENANT, LOAN_ID);
      expect(installmentsScheduler.refreshLoanCharges).toHaveBeenCalledWith(
        TENANT,
        LOAN_ID,
      );
    });

    it('throws NotFoundException when loan not found', async () => {
      loansRepo.findById.mockResolvedValue(null);
      await expect(service.findOne(TENANT, LOAN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findReceiptByInstallment', () => {
    it('returns the receipt containing an item for this installment', async () => {
      const receipt = { id: 'receipt-1', receiptNumber: '001-001-0000001' };
      topLevelPaymentReceiptFindFirstMock.mockResolvedValue(receipt);

      const result = await service.findReceiptByInstallment(TENANT, INST_ID);

      expect(result).toBe(receipt);
      expect(topLevelPaymentReceiptFindFirstMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: TENANT,
            items: { some: { installmentId: INST_ID } },
          },
        }),
      );
    });

    it('throws NotFoundException when no receipt covers this installment', async () => {
      topLevelPaymentReceiptFindFirstMock.mockResolvedValue(null);
      await expect(
        service.findReceiptByInstallment(TENANT, INST_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByOrder', () => {
    it('returns loan for the order', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(mockLoan as never);
      const result = await service.findByOrder(TENANT, ORDER_ID);
      expect(result).toMatchObject(mockLoan);
    });

    it('throws NotFoundException when no loan exists for order', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      await expect(service.findByOrder(TENANT, ORDER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createFromOrder', () => {
    it('returns existing loan without creating a new one (idempotent)', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(mockLoan as never);
      const result = await service.createFromOrder(TENANT, ORDER_ID);
      expect(result).toBe(mockLoan);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order does not exist', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.createFromOrder(TENANT, ORDER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnprocessableEntityException when order has no installments', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        installments: null,
      });
      await expect(service.createFromOrder(TENANT, ORDER_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('creates loan and installments for a valid credit order', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      const result = await service.createFromOrder(TENANT, ORDER_ID);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(mockLoan);
    });

    describe('installment due dates', () => {
      afterEach(() => {
        jest.useRealTimers();
      });

      function dueDates(): Date[] {
        return installmentCreateMock.mock.calls.map(
          (call) => (call[0] as { data: { dueDate: Date } }).data.dueDate,
        );
      }

      // Todas las fechas de este describe se anclan en UTC a propósito (
      // Date.UTC en vez de `new Date(y,m,d)`, que construye en la timezone
      // local del proceso corriendo el test) — mismo criterio que el fix de
      // producción. Con `new Date(y,m,d)` estos tests pasaban o fallaban
      // según la timezone del SO de quien los corría (acá, sin TZ fijado,
      // fallaban) en vez de probar la lógica de día-del-mes en sí.
      it("anchors due dates to the tenant's configured due day, not the purchase date", async () => {
        loansRepo.findBySaleOrder.mockResolvedValue(null);
        (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
        (prisma.creditConfig.findUnique as jest.Mock).mockResolvedValue({
          dueDayOfMonth: 5,
        });
        jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 7, 16))); // 16 ago. 2026

        await service.createFromOrder(TENANT, ORDER_ID);

        // día de compra (16) > día de corte (5) -> salta un mes extra
        expect(dueDates()[0]).toEqual(new Date(Date.UTC(2026, 9, 5))); // 05 oct. 2026
        expect(dueDates()[1]).toEqual(new Date(Date.UTC(2026, 10, 5))); // 05 nov. 2026
      });

      it('guarantees at least a full month of grace before the first installment', async () => {
        loansRepo.findBySaleOrder.mockResolvedValue(null);
        (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
        (prisma.creditConfig.findUnique as jest.Mock).mockResolvedValue({
          dueDayOfMonth: 5,
        });
        jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 6, 31))); // 31 jul. 2026

        await service.createFromOrder(TENANT, ORDER_ID);

        // 05 ago. 2026 quedaría a solo 5 días -> se salta a septiembre
        expect(dueDates()[0]).toEqual(new Date(Date.UTC(2026, 8, 5))); // 05 sep. 2026
      });

      it('falls back to day 5 when the tenant has no CreditConfig row yet', async () => {
        loansRepo.findBySaleOrder.mockResolvedValue(null);
        (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
        (prisma.creditConfig.findUnique as jest.Mock).mockResolvedValue(null);
        jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 7, 1))); // 01 ago. 2026

        await service.createFromOrder(TENANT, ORDER_ID);

        expect(dueDates()[0]).toEqual(new Date(Date.UTC(2026, 8, 5))); // 05 sep. 2026
      });

      it('respects a tenant-configured due day other than 5', async () => {
        loansRepo.findBySaleOrder.mockResolvedValue(null);
        (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
        (prisma.creditConfig.findUnique as jest.Mock).mockResolvedValue({
          dueDayOfMonth: 20,
        });
        jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 7, 1))); // 01 ago. 2026

        await service.createFromOrder(TENANT, ORDER_ID);

        // día de compra (1) <= día de corte (20) -> un mes de plazo alcanza
        expect(dueDates()[0]).toEqual(new Date(Date.UTC(2026, 8, 20))); // 20 sep. 2026
      });
    });

    it('includes a FIXED delivery surcharge in the financed principal', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        surchargeType: 'FIXED',
        surchargeAmount: 100,
      });
      const createSpy = jest.fn().mockResolvedValue({ id: LOAN_ID });
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        (fn: (tx: unknown) => unknown) =>
          fn({
            loan: {
              create: createSpy,
              findUniqueOrThrow: jest.fn().mockResolvedValue(mockLoan),
            },
            installment: { create: jest.fn().mockResolvedValue({}) },
          }),
      );

      await service.createFromOrder(TENANT, ORDER_ID);

      // items = 2 * 500 = 1000; +100 recargo fijo = 1100 principal; interés 10% -> 1210 total
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ principal: 1100, totalAmount: 1210 }),
        }),
      );
    });

    it('includes a PERCENTAGE delivery surcharge in the financed principal', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        surchargeType: 'PERCENTAGE',
        surchargeAmount: 10,
      });
      const createSpy = jest.fn().mockResolvedValue({ id: LOAN_ID });
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        (fn: (tx: unknown) => unknown) =>
          fn({
            loan: {
              create: createSpy,
              findUniqueOrThrow: jest.fn().mockResolvedValue(mockLoan),
            },
            installment: { create: jest.fn().mockResolvedValue({}) },
          }),
      );

      await service.createFromOrder(TENANT, ORDER_ID);

      // items = 1000; +10% recargo = 100 -> 1100 principal; interés 10% -> 1210 total
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ principal: 1100, totalAmount: 1210 }),
        }),
      );
    });

    it('does not add a surcharge to principal when the order has none', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      (prisma.saleOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      const createSpy = jest.fn().mockResolvedValue({ id: LOAN_ID });
      (prisma.$transaction as jest.Mock).mockImplementationOnce(
        (fn: (tx: unknown) => unknown) =>
          fn({
            loan: {
              create: createSpy,
              findUniqueOrThrow: jest.fn().mockResolvedValue(mockLoan),
            },
            installment: { create: jest.fn().mockResolvedValue({}) },
          }),
      );

      await service.createFromOrder(TENANT, ORDER_ID);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ principal: 1000 }),
        }),
      );
    });
  });

  describe('rescheduleInstallments', () => {
    const scheduledLoan = {
      ...mockLoan,
      installments: [
        {
          id: INST_ID,
          number: 1,
          dueDate: new Date(2026, 8, 5),
          status: 'PENDING',
        },
        {
          id: 'inst-2',
          number: 2,
          dueDate: new Date(2026, 9, 5),
          status: 'PENDING',
        },
      ],
    };

    it('does nothing when there is no loan for the order (cash sale)', async () => {
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(null);
      await service.rescheduleInstallments(
        TENANT,
        ORDER_ID,
        new Date(2026, 8, 10),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when the new date matches the current first due date', async () => {
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(scheduledLoan);
      await service.rescheduleInstallments(
        TENANT,
        ORDER_ID,
        new Date(2026, 8, 5),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does nothing when any installment is already PAID', async () => {
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue({
        ...scheduledLoan,
        installments: [
          { ...scheduledLoan.installments[0], status: 'PAID' },
          scheduledLoan.installments[1],
        ],
      });
      await service.rescheduleInstallments(
        TENANT,
        ORDER_ID,
        new Date(2026, 8, 10),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('shifts every installment to preserve the monthly pattern from the new first due date', async () => {
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(scheduledLoan);

      await service.rescheduleInstallments(
        TENANT,
        ORDER_ID,
        new Date(2026, 8, 10),
      );

      expect(installmentUpdateMock).toHaveBeenCalledWith({
        where: { id: INST_ID },
        data: { dueDate: new Date(2026, 8, 10) },
      });
      expect(installmentUpdateMock).toHaveBeenCalledWith({
        where: { id: 'inst-2' },
        data: { dueDate: new Date(2026, 9, 10) },
      });
    });
  });

  describe('payInstallment', () => {
    const mockInstallment = {
      id: INST_ID,
      tenantId: TENANT,
      loanId: LOAN_ID,
      number: 1,
      amount: 550,
      paidAmount: 0,
      status: 'PENDING',
      loan: {
        id: LOAN_ID,
        saleOrderId: ORDER_ID,
        customerId: 'customer-1',
        saleOrder: { branchId: null },
      },
    };

    const baseDto: PayInstallmentDto = {
      amount: 200,
      paymentMethod: PaymentMethod.CASH,
    };

    it('throws NotFoundException when installment not found', async () => {
      installmentsRepo.findById.mockResolvedValue(null);
      await expect(
        service.payInstallment(TENANT, INST_ID, { ...baseDto, amount: 100 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException when installment already paid', async () => {
      installmentsRepo.findById.mockResolvedValue({
        ...mockInstallment,
        status: 'PAID',
      } as never);
      await expect(
        service.payInstallment(TENANT, INST_ID, { ...baseDto, amount: 50 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when payment exceeds balance', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      await expect(
        service.payInstallment(TENANT, INST_ID, { ...baseDto, amount: 600 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('sets status PARTIAL on partial payment', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentUpdateMock.mockResolvedValue({
        ...mockInstallment,
        paidAmount: 200,
        status: 'PARTIAL',
      });
      const result = await service.payInstallment(TENANT, INST_ID, baseDto);
      expect(installmentUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INST_ID },
          data: expect.objectContaining({
            paidAmount: 200,
            status: 'PARTIAL',
            paidAt: undefined,
          }),
        }),
      );
      expect(result.installment?.status).toBe('PARTIAL');
      expect(result.receipt).toBeDefined();
    });

    it('sets status PAID and paidAt when full amount is paid', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentsRepo.findByLoan.mockResolvedValue([
        { id: INST_ID, status: 'PAID' },
      ] as never);
      installmentUpdateMock.mockResolvedValue({
        ...mockInstallment,
        paidAmount: 550,
        status: 'PAID',
      });
      await service.payInstallment(TENANT, INST_ID, {
        ...baseDto,
        amount: 550,
      });
      expect(installmentUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INST_ID },
          data: expect.objectContaining({
            paidAmount: 550,
            status: 'PAID',
            paidAt: expect.any(Date),
          }),
        }),
      );
    });

    it('emits installment.paid event after successful payment', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentUpdateMock.mockResolvedValue({
        ...mockInstallment,
        paidAmount: 200,
        status: 'PARTIAL',
      });
      await service.payInstallment(TENANT, INST_ID, baseDto);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'installment.paid',
        expect.objectContaining({
          tenantId: TENANT,
          loanId: LOAN_ID,
          saleOrderId: ORDER_ID,
          installmentId: INST_ID,
          amount: baseDto.amount,
        }),
      );
    });

    it('persists paymentMethod, paymentReference, and paymentDate', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentUpdateMock.mockResolvedValue({
        ...mockInstallment,
        paidAmount: 200,
        status: 'PARTIAL',
      });
      await service.payInstallment(TENANT, INST_ID, {
        amount: 200,
        paymentMethod: PaymentMethod.PAGO_EXPRESS,
        paymentReference: 'REF-001',
        paymentDate: '2026-07-30',
      });
      expect(installmentUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INST_ID },
          data: expect.objectContaining({
            paymentMethod: 'PAGO_EXPRESS',
            paymentReference: 'REF-001',
            paymentDate: expect.any(Date),
          }),
        }),
      );
    });

    it('generates a payment receipt with the paid amount and installment', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentUpdateMock.mockResolvedValue({
        ...mockInstallment,
        paidAmount: 200,
        status: 'PARTIAL',
      });

      await service.payInstallment(TENANT, INST_ID, baseDto);

      expect(paymentReceiptCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT,
            loanId: LOAN_ID,
            customerId: 'customer-1',
            establecimiento: '001',
            puntoExpedicion: '001',
            sequential: 1,
            receiptNumber: '001-001-0000001',
            totalAmount: baseDto.amount,
          }),
        }),
      );
    });

    it('charges open interest/mora charges before principal, itemizing each on the receipt', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentsRepo.findOpenChargesByInstallments.mockResolvedValue([
        {
          id: 'charge-1',
          installmentId: INST_ID,
          amount: 50,
          component: { name: 'Gastos administrativos' },
        },
      ] as never);
      installmentUpdateMock.mockResolvedValue({
        ...mockInstallment,
        paidAmount: 150,
        status: 'PARTIAL',
      });

      // Paga 200: primero los 50 de gastos administrativos, el resto (150) a capital.
      await service.payInstallment(TENANT, INST_ID, {
        ...baseDto,
        amount: 200,
      });

      expect(installmentsRepo.updateChargeAmount).toHaveBeenCalledWith(
        'charge-1',
        0,
        expect.anything(),
      );
      expect(installmentUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ paidAmount: 150 }),
        }),
      );
      expect(paymentReceiptCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                {
                  installmentId: INST_ID,
                  installmentNumber: 1,
                  amountApplied: 50,
                  kind: 'INTEREST_COMPONENT',
                  componentName: 'Gastos administrativos',
                },
                {
                  installmentId: INST_ID,
                  installmentNumber: 1,
                  amountApplied: 150,
                  kind: 'PRINCIPAL',
                  componentName: null,
                },
              ],
            },
          }),
        }),
      );
    });

    it('allows a payment that exactly covers principal + open charges but not more', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentsRepo.findOpenChargesByInstallments.mockResolvedValue([
        {
          id: 'charge-1',
          installmentId: INST_ID,
          amount: 50,
          component: { name: 'Mora' },
        },
      ] as never);

      // Cuota de 550 + 50 de mora = 600 de saldo total. 601 se pasa.
      await expect(
        service.payInstallment(TENANT, INST_ID, { ...baseDto, amount: 601 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('payByAmount', () => {
    const mockLoanWithBranch = {
      id: LOAN_ID,
      tenantId: TENANT,
      customerId: 'customer-1',
      status: 'ACTIVE',
      saleOrder: { id: ORDER_ID, orderDate: new Date(), branchId: null },
    };

    it('splits a single payment across multiple pending installments in one receipt', async () => {
      loansRepo.findById.mockResolvedValue(mockLoanWithBranch as never);
      installmentsRepo.findPendingByLoan.mockResolvedValue([
        {
          id: 'inst-1',
          number: 1,
          amount: 300,
          paidAmount: 0,
          status: 'PENDING',
        },
        {
          id: 'inst-2',
          number: 2,
          amount: 300,
          paidAmount: 0,
          status: 'PENDING',
        },
      ] as never);
      installmentsRepo.findByLoan.mockResolvedValue([
        { id: 'inst-1', status: 'PARTIAL' },
        { id: 'inst-2', status: 'PENDING' },
      ] as never);

      const result = await service.payByAmount(TENANT, LOAN_ID, {
        amount: 400,
        paymentMethod: 'CASH',
      });

      // 300 agota la primera cuota, los 100 restantes van a la segunda —
      // el recibo debe tener un ítem por cada cuota tocada, no uno solo.
      expect(paymentReceiptCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 400,
            items: {
              create: [
                {
                  installmentId: 'inst-1',
                  installmentNumber: 1,
                  amountApplied: 300,
                  kind: 'PRINCIPAL',
                  componentName: null,
                },
                {
                  installmentId: 'inst-2',
                  installmentNumber: 2,
                  amountApplied: 100,
                  kind: 'PRINCIPAL',
                  componentName: null,
                },
              ],
            },
          }),
        }),
      );
      expect(result.receipt).toBeDefined();
    });

    it('throws when the loan is already fully paid', async () => {
      loansRepo.findById.mockResolvedValue({
        ...mockLoanWithBranch,
        status: 'PAID',
      } as never);
      await expect(
        service.payByAmount(TENANT, LOAN_ID, {
          amount: 100,
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('includes open interest/mora charges in the total outstanding validation', async () => {
      loansRepo.findById.mockResolvedValue(mockLoanWithBranch as never);
      installmentsRepo.findPendingByLoan.mockResolvedValue([
        {
          id: 'inst-1',
          number: 1,
          amount: 300,
          paidAmount: 0,
          status: 'PENDING',
        },
      ] as never);
      installmentsRepo.findOpenChargesByInstallments.mockResolvedValue([
        {
          id: 'charge-1',
          installmentId: 'inst-1',
          amount: 50,
          component: { name: 'Mora' },
        },
      ] as never);

      // Saldo real: 300 capital + 50 mora = 350. 351 debe rechazarse.
      await expect(
        service.payByAmount(TENANT, LOAN_ID, {
          amount: 351,
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('payInstallments', () => {
    const mockLoanWithBranch = {
      id: LOAN_ID,
      tenantId: TENANT,
      customerId: 'customer-1',
      status: 'ACTIVE',
      saleOrder: { id: ORDER_ID, orderDate: new Date(), branchId: null },
    };

    it('pays a specific selection of installments in a single receipt', async () => {
      loansRepo.findById.mockResolvedValue(mockLoanWithBranch as never);
      installmentsRepo.findPendingByLoan.mockResolvedValue([
        {
          id: 'inst-1',
          number: 1,
          amount: 300,
          paidAmount: 0,
          status: 'PENDING',
        },
        {
          id: 'inst-2',
          number: 2,
          amount: 300,
          paidAmount: 0,
          status: 'PENDING',
        },
        {
          id: 'inst-3',
          number: 3,
          amount: 300,
          paidAmount: 0,
          status: 'PENDING',
        },
      ] as never);
      installmentsRepo.findByLoan.mockResolvedValue([
        { id: 'inst-1', status: 'PAID' },
        { id: 'inst-2', status: 'PARTIAL' },
        { id: 'inst-3', status: 'PENDING' },
      ] as never);

      const result = await service.payInstallments(TENANT, LOAN_ID, {
        items: [
          { installmentId: 'inst-1', amount: 300 },
          { installmentId: 'inst-2', amount: 150 },
        ],
        paymentMethod: 'CASH',
      });

      // Selección explícita, no necesariamente contigua desde la más
      // antigua — inst-3 nunca se toca aunque esté pendiente.
      expect(paymentReceiptCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 450,
            items: {
              create: [
                {
                  installmentId: 'inst-1',
                  installmentNumber: 1,
                  amountApplied: 300,
                  kind: 'PRINCIPAL',
                  componentName: null,
                },
                {
                  installmentId: 'inst-2',
                  installmentNumber: 2,
                  amountApplied: 150,
                  kind: 'PRINCIPAL',
                  componentName: null,
                },
              ],
            },
          }),
        }),
      );
      expect(result.receipt).toBeDefined();
    });

    it('throws when an installment does not belong to the loan', async () => {
      loansRepo.findById.mockResolvedValue(mockLoanWithBranch as never);
      installmentsRepo.findPendingByLoan.mockResolvedValue([
        {
          id: 'inst-1',
          number: 1,
          amount: 300,
          paidAmount: 0,
          status: 'PENDING',
        },
      ] as never);

      await expect(
        service.payInstallments(TENANT, LOAN_ID, {
          items: [{ installmentId: 'inst-ajena', amount: 100 }],
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(paymentReceiptCreateMock).not.toHaveBeenCalled();
    });

    it('throws when the amount for an installment exceeds its outstanding balance', async () => {
      loansRepo.findById.mockResolvedValue(mockLoanWithBranch as never);
      installmentsRepo.findPendingByLoan.mockResolvedValue([
        {
          id: 'inst-1',
          number: 1,
          amount: 300,
          paidAmount: 200,
          status: 'PARTIAL',
        },
      ] as never);

      await expect(
        service.payInstallments(TENANT, LOAN_ID, {
          items: [{ installmentId: 'inst-1', amount: 150 }],
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(paymentReceiptCreateMock).not.toHaveBeenCalled();
    });

    it('throws when the loan is already fully paid', async () => {
      loansRepo.findById.mockResolvedValue({
        ...mockLoanWithBranch,
        status: 'PAID',
      } as never);
      await expect(
        service.payInstallments(TENANT, LOAN_ID, {
          items: [{ installmentId: 'inst-1', amount: 100 }],
          paymentMethod: 'CASH',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
