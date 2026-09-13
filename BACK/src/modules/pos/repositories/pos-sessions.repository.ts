import { Injectable } from '@nestjs/common';
import { PosSessionStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreatePosSessionData {
  terminalId: string;
  cashierId: string;
  openingCash: number;
}

export interface ClosePosSessionData {
  closingCash: number;
  expectedCash: number;
  difference: number;
  status: 'CLOSED' | 'DISCREPANCY';
  notes?: string;
}

@Injectable()
export class PosSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      terminal: { select: { id: true, name: true, branchId: true } },
      cashier: { select: { id: true, firstName: true, lastName: true } },
    };
  }

  findActiveByTerminal(tenantId: string, terminalId: string) {
    return this.prisma.posSession.findFirst({
      where: { tenantId, terminalId, status: 'OPEN' },
    });
  }

  findActiveByCashier(tenantId: string, cashierId: string) {
    return this.prisma.posSession.findFirst({
      where: { tenantId, cashierId, status: 'OPEN' },
      include: this.include,
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.posSession.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  findAll(
    tenantId: string,
    filters: { terminalId?: string; status?: PosSessionStatus } = {},
  ) {
    return this.prisma.posSession.findMany({
      where: {
        tenantId,
        ...(filters.terminalId && { terminalId: filters.terminalId }),
        ...(filters.status && { status: filters.status }),
      },
      include: this.include,
      orderBy: { openedAt: 'desc' },
    });
  }

  // Sum of CASH payments collected under this session — the basis for expectedCash.
  sumCashPayments(tenantId: string, sessionId: string) {
    return this.prisma.salePayment.aggregate({
      where: { tenantId, posSessionId: sessionId, paymentMethod: 'CASH' },
      _sum: { amount: true },
    });
  }

  create(tenantId: string, data: CreatePosSessionData) {
    return this.prisma.posSession.create({
      data: { tenantId, ...data, status: 'OPEN', openedAt: new Date() },
      include: this.include,
    });
  }

  close(id: string, data: ClosePosSessionData) {
    return this.prisma.posSession.update({
      where: { id },
      data: { ...data, closedAt: new Date() },
      include: this.include,
    });
  }
}
