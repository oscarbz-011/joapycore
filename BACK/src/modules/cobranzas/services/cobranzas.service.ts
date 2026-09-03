import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { CollectionRoutesRepository } from '../repositories/collection-routes.repository';
import { CollectionVisitsRepository } from '../repositories/collection-visits.repository';
import { PaymentAgreementsRepository } from '../repositories/payment-agreements.repository';
import { CollectionNotesRepository } from '../repositories/collection-notes.repository';
import { DelinquencyReportsRepository } from '../repositories/delinquency-reports.repository';
import type { CreateCollectionRouteDto } from '../dto/create-collection-route.dto';
import type { AddVisitDto } from '../dto/add-visit.dto';
import type { UpdateVisitResultDto } from '../dto/update-visit-result.dto';
import type { CreatePaymentAgreementDto } from '../dto/create-payment-agreement.dto';
import type { AddCollectionNoteDto } from '../dto/add-collection-note.dto';
import type { UpdateDelinquencyReportDto } from '../dto/update-delinquency-report.dto';
import type { DelinquencyReportStatus } from '@prisma/client';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

@Injectable()
export class CobranzasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routesRepo: CollectionRoutesRepository,
    private readonly visitsRepo: CollectionVisitsRepository,
    private readonly agreementsRepo: PaymentAgreementsRepository,
    private readonly notesRepo: CollectionNotesRepository,
    private readonly delinquencyReportsRepo: DelinquencyReportsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Morosos ────────────────────────────────────────────────────────────────

  findAllDelinquencyReports(
    tenantId: string,
    status?: DelinquencyReportStatus,
  ) {
    return this.delinquencyReportsRepo.findAll(tenantId, status);
  }

  async findDelinquencyReport(tenantId: string, id: string) {
    const report = await this.delinquencyReportsRepo.findById(tenantId, id);
    if (!report)
      throw new NotFoundException('Registro de moroso no encontrado');
    return report;
  }

  async updateDelinquencyReportStatus(
    tenantId: string,
    id: string,
    dto: UpdateDelinquencyReportDto,
    userId: string,
  ) {
    await this.findDelinquencyReport(tenantId, id);
    const updated = await this.delinquencyReportsRepo.updateStatus(id, {
      status: dto.status,
      reference: dto.reference,
      notes: dto.notes,
      reviewedById: userId,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: `delinquency.report.${dto.status.toLowerCase()}`,
      resourceId: id,
    } satisfies AuditLogEvent);

    return updated;
  }

  // ── Routes ─────────────────────────────────────────────────────────────────

  findAllRoutes(
    tenantId: string,
    collectorId?: string,
    filters?: { status?: string; from?: Date; to?: Date },
  ) {
    return this.routesRepo.findAll(tenantId, { collectorId, ...filters });
  }

  async findRoute(tenantId: string, id: string) {
    const route = await this.routesRepo.findById(tenantId, id);
    if (!route) throw new NotFoundException('Ruta de cobranza no encontrada');
    return route;
  }

  async createRoute(
    tenantId: string,
    dto: CreateCollectionRouteDto,
    userId: string,
  ) {
    const route = await this.routesRepo.create({
      tenantId,
      routeDate: dto.routeDate,
      collectorId: dto.collectorId ?? null,
      notes: dto.notes ?? null,
      createdById: userId,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'collection.route.created',
      resourceId: route.id,
    } satisfies AuditLogEvent);
    return route;
  }

  async addVisit(
    tenantId: string,
    routeId: string,
    dto: AddVisitDto,
    userId: string,
  ) {
    const route = await this.findRoute(tenantId, routeId);
    if (route.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        'Solo se pueden agregar visitas a rutas abiertas',
      );
    }
    const visit = await this.visitsRepo.create({
      tenantId,
      routeId,
      customerId: dto.customerId,
      loanId: dto.loanId ?? null,
      installmentId: dto.installmentId ?? null,
      arId: dto.arId ?? null,
      plannedAmount: dto.plannedAmount,
      visitOrder: dto.visitOrder ?? 0,
    });
    // Update totalPlanned
    await this.prisma.collectionRoute.update({
      where: { id: routeId },
      data: { totalPlanned: { increment: dto.plannedAmount } },
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'collection.visit.added',
      resourceId: visit.id,
    } satisfies AuditLogEvent);
    return visit;
  }

  async removeVisit(
    tenantId: string,
    routeId: string,
    visitId: string,
    userId: string,
  ) {
    const visit = await this.visitsRepo.findById(tenantId, visitId);
    if (!visit || visit.routeId !== routeId) {
      throw new NotFoundException('Visita no encontrada en esta ruta');
    }
    const route = await this.findRoute(tenantId, routeId);
    if (route.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        'No se puede eliminar una visita de una ruta cerrada',
      );
    }
    await this.visitsRepo.delete(visitId);
    await this.prisma.collectionRoute.update({
      where: { id: routeId },
      data: { totalPlanned: { decrement: toNum(visit.plannedAmount) } },
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'collection.visit.removed',
      resourceId: visitId,
    } satisfies AuditLogEvent);
    return { removed: true };
  }

  async recordVisitResult(
    tenantId: string,
    routeId: string,
    visitId: string,
    dto: UpdateVisitResultDto,
    userId: string,
  ) {
    const visit = await this.visitsRepo.findById(tenantId, visitId);
    if (!visit || visit.routeId !== routeId) {
      throw new NotFoundException('Visita no encontrada en esta ruta');
    }
    const prevCollected = toNum(visit.collectedAmount);
    const newCollected = dto.collectedAmount ?? 0;

    const updated = await this.visitsRepo.update(visitId, {
      result: dto.result,
      collectedAmount: newCollected,
      paymentMethod: (dto.paymentMethod as any) ?? null,
      reference: dto.reference ?? null,
      promiseDate: dto.promiseDate ?? null,
      notes: dto.notes ?? null,
      visitedAt: new Date(),
    });

    const delta = newCollected - prevCollected;
    if (delta !== 0) {
      await this.prisma.collectionRoute.update({
        where: { id: routeId },
        data: { totalCollected: { increment: delta } },
      });
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'collection.visit.result',
      resourceId: visitId,
    } satisfies AuditLogEvent);
    return updated;
  }

  async closeRoute(tenantId: string, id: string, userId: string) {
    const route = await this.findRoute(tenantId, id);
    if (route.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        'La ruta ya fue cerrada o cancelada',
      );
    }
    const closed = await this.routesRepo.update(id, {
      status: 'CLOSED',
      closedAt: new Date(),
      closedById: userId,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'collection.route.closed',
      resourceId: id,
    } satisfies AuditLogEvent);
    return closed;
  }

  async cancelRoute(tenantId: string, id: string, userId: string) {
    const route = await this.findRoute(tenantId, id);
    if (route.status !== 'OPEN') {
      throw new UnprocessableEntityException(
        'Solo se pueden cancelar rutas abiertas',
      );
    }
    const cancelled = await this.routesRepo.update(id, { status: 'CANCELLED' });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'collection.route.cancelled',
      resourceId: id,
    } satisfies AuditLogEvent);
    return cancelled;
  }

  // ── Payment Agreements ──────────────────────────────────────────────────────

  findAllAgreements(tenantId: string, customerId?: string) {
    return this.agreementsRepo.findAll(tenantId, customerId);
  }

  async findAgreement(tenantId: string, id: string) {
    const ag = await this.agreementsRepo.findById(tenantId, id);
    if (!ag) throw new NotFoundException('Acuerdo de pago no encontrado');
    return ag;
  }

  async createAgreement(
    tenantId: string,
    dto: CreatePaymentAgreementDto,
    userId: string,
  ) {
    const agreement = await this.agreementsRepo.create({
      tenantId,
      customerId: dto.customerId,
      loanId: dto.loanId ?? null,
      originalDebt: dto.originalDebt,
      agreedInstallments: dto.agreedInstallments,
      agreedAmount: dto.agreedAmount,
      startDate: dto.startDate,
      notes: dto.notes ?? null,
      createdById: userId,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'payment.agreement.created',
      resourceId: agreement.id,
    } satisfies AuditLogEvent);
    return agreement;
  }

  async approveAgreement(tenantId: string, id: string, userId: string) {
    const ag = await this.findAgreement(tenantId, id);
    if (ag.status !== 'ACTIVE') {
      throw new UnprocessableEntityException(
        'Solo se pueden aprobar acuerdos activos',
      );
    }
    const updated = await this.agreementsRepo.update(id, {
      approvedById: userId,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: 'payment.agreement.approved',
      resourceId: id,
    } satisfies AuditLogEvent);
    return updated;
  }

  async updateAgreementStatus(
    tenantId: string,
    id: string,
    status: 'FULFILLED' | 'BROKEN' | 'CANCELLED',
    userId: string,
  ) {
    await this.findAgreement(tenantId, id);
    const updated = await this.agreementsRepo.update(id, { status });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'collections',
      action: `payment.agreement.${status.toLowerCase()}`,
      resourceId: id,
    } satisfies AuditLogEvent);
    return updated;
  }

  // ── Collection Notes ────────────────────────────────────────────────────────

  findNotesByCustomer(tenantId: string, customerId: string) {
    return this.notesRepo.findByCustomer(tenantId, customerId);
  }

  async addNote(tenantId: string, dto: AddCollectionNoteDto, userId: string) {
    return this.notesRepo.create({
      tenantId,
      customerId: dto.customerId,
      note: dto.note,
      type: (dto.type as any) ?? 'GENERAL',
      createdById: userId,
    });
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────

  async getKpis(tenantId: string) {
    const [openRoutes, routesToday, activeAgreements, overdueInstallments] =
      await Promise.all([
        this.prisma.collectionRoute.count({
          where: { tenantId, status: 'OPEN' },
        }),
        this.prisma.collectionRoute.count({
          where: {
            tenantId,
            routeDate: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        }),
        this.prisma.paymentAgreement.count({
          where: { tenantId, status: 'ACTIVE' },
        }),
        this.prisma.installment.count({
          where: { tenantId, status: 'OVERDUE' },
        }),
      ]);

    const totalCollectedResult = await this.prisma.collectionRoute.aggregate({
      where: { tenantId, status: 'CLOSED' },
      _sum: { totalCollected: true },
    });

    return {
      openRoutes,
      routesToday,
      activeAgreements,
      overdueInstallments,
      totalCollected: toNum(totalCollectedResult._sum.totalCollected ?? 0),
    };
  }
}
