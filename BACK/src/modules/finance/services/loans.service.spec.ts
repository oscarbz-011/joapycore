import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayInstallmentDto } from '../dto/pay-installment.dto';
import { PaymentMethod } from '@prisma/client';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { LoansService } from './loans.service';

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
  contractUrl: null,
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
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = {
      saleOrder: { findFirst: jest.fn() },
      loan: { create: jest.fn(), findUniqueOrThrow: jest.fn() },
      installment: { create: jest.fn() },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
        fn({
          loan: {
            create: jest.fn().mockResolvedValue({ id: LOAN_ID }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(mockLoan),
          },
          installment: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };

    const mockLoansRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findBySaleOrder: jest.fn(),
      create: jest.fn(),
      updateContractUrl: jest.fn(),
    };

    const mockInstallmentsRepo = {
      findByLoan: jest.fn(),
      findById: jest.fn(),
      findOverdue: jest.fn(),
      update: jest.fn(),
    };

    const mockEventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoansRepository, useValue: mockLoansRepo },
        { provide: InstallmentsRepository, useValue: mockInstallmentsRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get(LoansService);
    loansRepo = module.get(LoansRepository);
    installmentsRepo = module.get(InstallmentsRepository);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2) as { emit: jest.Mock };
  });

  describe('findOne', () => {
    it('returns loan when found', async () => {
      loansRepo.findById.mockResolvedValue(mockLoan as never);
      const result = await service.findOne(TENANT, LOAN_ID);
      expect(result).toBe(mockLoan);
      expect(loansRepo.findById).toHaveBeenCalledWith(TENANT, LOAN_ID);
    });

    it('throws NotFoundException when loan not found', async () => {
      loansRepo.findById.mockResolvedValue(null);
      await expect(service.findOne(TENANT, LOAN_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByOrder', () => {
    it('returns loan for the order', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(mockLoan as never);
      const result = await service.findByOrder(TENANT, ORDER_ID);
      expect(result).toBe(mockLoan);
    });

    it('throws NotFoundException when no loan exists for order', async () => {
      loansRepo.findBySaleOrder.mockResolvedValue(null);
      await expect(service.findByOrder(TENANT, ORDER_ID)).rejects.toThrow(NotFoundException);
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
      await expect(service.createFromOrder(TENANT, ORDER_ID)).rejects.toThrow(NotFoundException);
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
      loan: { id: LOAN_ID, saleOrderId: ORDER_ID },
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
      installmentsRepo.findById.mockResolvedValue({ ...mockInstallment, status: 'PAID' } as never);
      await expect(service.payInstallment(TENANT, INST_ID, { ...baseDto, amount: 50 })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('throws UnprocessableEntityException when payment exceeds balance', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      await expect(service.payInstallment(TENANT, INST_ID, { ...baseDto, amount: 600 })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('sets status PARTIAL on partial payment', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentsRepo.update.mockResolvedValue({ ...mockInstallment, paidAmount: 200, status: 'PARTIAL' } as never);
      const result = await service.payInstallment(TENANT, INST_ID, baseDto);
      expect(installmentsRepo.update).toHaveBeenCalledWith(
        INST_ID,
        expect.objectContaining({ paidAmount: 200, status: 'PARTIAL', paidAt: undefined }),
      );
      expect(result.status).toBe('PARTIAL');
    });

    it('sets status PAID and paidAt when full amount is paid', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentsRepo.update.mockResolvedValue({ ...mockInstallment, paidAmount: 550, status: 'PAID' } as never);
      await service.payInstallment(TENANT, INST_ID, { ...baseDto, amount: 550 });
      expect(installmentsRepo.update).toHaveBeenCalledWith(
        INST_ID,
        expect.objectContaining({ paidAmount: 550, status: 'PAID', paidAt: expect.any(Date) }),
      );
    });

    it('emits installment.paid event after successful payment', async () => {
      installmentsRepo.findById.mockResolvedValue(mockInstallment as never);
      installmentsRepo.update.mockResolvedValue({ ...mockInstallment, paidAmount: 200, status: 'PARTIAL' } as never);
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
      installmentsRepo.update.mockResolvedValue({ ...mockInstallment, paidAmount: 200, status: 'PARTIAL' } as never);
      await service.payInstallment(TENANT, INST_ID, {
        amount: 200,
        paymentMethod: PaymentMethod.PAGO_EXPRESS,
        paymentReference: 'REF-001',
        paymentDate: '2026-07-30',
      });
      expect(installmentsRepo.update).toHaveBeenCalledWith(
        INST_ID,
        expect.objectContaining({
          paymentMethod: 'PAGO_EXPRESS',
          paymentReference: 'REF-001',
          paymentDate: expect.any(Date),
        }),
      );
    });
  });
});
