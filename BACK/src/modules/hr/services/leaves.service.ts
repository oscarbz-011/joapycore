import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeaveStatus, Prisma } from '@prisma/client';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateLeaveDto,
  FilterLeavesDto,
  UpsertLeaveBalanceDto,
} from '../dto/create-leave.dto';
import { EmployeesRepository } from '../repositories/employees.repository';
import { LeavesRepository } from '../repositories/leaves.repository';
import { businessDaysBetween, legalVacationDays } from './leave-calc';

export interface LeaveBalanceView {
  employeeId: string;
  year: number;
  entitled: number;
  taken: number;
  pending: number;
  available: number;
}

/**
 * Licencias y vacaciones de empleados.
 *
 * Solo las vacaciones (VACATION) consumen el saldo anual: al solicitarlas se
 * reservan como "pendientes", al aprobarlas pasan a "tomadas" y al rechazar o
 * cancelar se devuelven. Las demás licencias (enfermedad, maternidad, etc.) se
 * registran y aprueban pero no descuentan saldo. El año del saldo es el de la
 * fecha de inicio.
 */
@Injectable()
export class LeavesService {
  constructor(
    // Solo para abrir transacciones; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly leavesRepository: LeavesRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  list(tenantId: string, filters: FilterLeavesDto) {
    return this.leavesRepository.findAll(tenantId, filters);
  }

  async getBalance(
    tenantId: string,
    employeeId: string,
    year: number = new Date().getUTCFullYear(),
  ): Promise<LeaveBalanceView> {
    const employee = await this.getEmployee(tenantId, employeeId);
    const balance = await this.leavesRepository.createBalanceIfMissing(
      tenantId,
      employee.id,
      year,
      legalVacationDays(employee.hireDate, year),
    );
    return toView(balance);
  }

  async setEntitlement(
    tenantId: string,
    employeeId: string,
    dto: UpsertLeaveBalanceDto,
    userId?: string,
  ): Promise<LeaveBalanceView> {
    await this.getEmployee(tenantId, employeeId);
    const balance = await this.leavesRepository.setEntitlement(
      tenantId,
      employeeId,
      dto.year,
      dto.entitled,
    );
    this.audit(tenantId, userId, 'leave.balance.updated', balance.id, dto);
    return toView(balance);
  }

  async request(tenantId: string, dto: CreateLeaveDto, userId?: string) {
    const employee = await this.getEmployee(tenantId, dto.employeeId);
    if (!employee.isActive || employee.terminationDate) {
      throw new UnprocessableEntityException('El empleado está dado de baja');
    }

    const startDate = toCalendarDay(dto.startDate);
    const endDate = toCalendarDay(dto.endDate);
    if (endDate < startDate) {
      throw new UnprocessableEntityException(
        'La fecha de fin no puede ser anterior a la de inicio',
      );
    }
    const days = businessDaysBetween(startDate, endDate);
    if (days === 0) {
      throw new UnprocessableEntityException(
        'El rango elegido no tiene días hábiles',
      );
    }
    const year = startDate.getUTCFullYear();

    const leave = await this.prisma.$transaction(async (tx) => {
      await this.leavesRepository.lockEmployee(tenantId, employee.id, tx);
      const overlapping = await this.leavesRepository.findOverlapping(
        tenantId,
        employee.id,
        startDate,
        endDate,
        tx,
      );
      if (overlapping) {
        throw new ConflictException(
          'El empleado ya tiene una licencia pendiente o aprobada en esas fechas',
        );
      }

      if (dto.type === 'VACATION') {
        const balance = await this.leavesRepository.createBalanceIfMissing(
          tenantId,
          employee.id,
          year,
          legalVacationDays(employee.hireDate, year),
          tx,
        );
        const available = toView(balance).available;
        if (days > available) {
          throw new UnprocessableEntityException(
            `Vacaciones insuficientes para ${year}: disponibles ${available} día(s) hábil(es), solicitados ${days}`,
          );
        }
        await this.leavesRepository.adjustBalance(
          tenantId,
          employee.id,
          year,
          { pending: days },
          tx,
        );
      }

      return this.leavesRepository.create(
        {
          tenantId,
          employeeId: employee.id,
          type: dto.type,
          startDate,
          endDate,
          days,
          notes: dto.notes,
        },
        tx,
      );
    });

    this.eventEmitter.emit('hr.leave.requested', {
      tenantId,
      leaveId: leave.id,
    });
    this.audit(tenantId, userId, 'leave.requested', leave.id, undefined, leave);
    return leave;
  }

  async approve(tenantId: string, id: string, userId?: string) {
    const approver = userId
      ? await this.employeesRepository.findByUserId(userId)
      : null;
    return this.transition(tenantId, id, ['PENDING'], 'APPROVED', userId, {
      approvedById:
        approver && approver.tenantId === tenantId ? approver.id : null,
      approvedAt: new Date(),
    });
  }

  reject(tenantId: string, id: string, reason?: string, userId?: string) {
    return this.transition(tenantId, id, ['PENDING'], 'REJECTED', userId, {
      ...(reason ? { notes: reason } : {}),
    });
  }

  async cancel(tenantId: string, id: string, userId?: string) {
    const leave = await this.getLeave(tenantId, id);
    // Una licencia aprobada que ya empezó no se cancela: ya se gozó.
    if (leave.status === 'APPROVED' && leave.startDate < startOfBusinessDay()) {
      throw new UnprocessableEntityException(
        'No se puede cancelar una licencia aprobada que ya comenzó',
      );
    }
    return this.transition(
      tenantId,
      id,
      ['PENDING', 'APPROVED'],
      'CANCELLED',
      userId,
      {},
    );
  }

  private async transition(
    tenantId: string,
    id: string,
    from: LeaveStatus[],
    to: LeaveStatus,
    userId: string | undefined,
    extra: Prisma.LeaveUncheckedUpdateManyInput,
  ) {
    const before = await this.getLeave(tenantId, id);
    if (!from.includes(before.status)) {
      throw new UnprocessableEntityException(
        `La licencia está ${STATUS_LABEL[before.status]} y no puede pasar a ${STATUS_LABEL[to]}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const changed = await this.leavesRepository.transition(
        tenantId,
        id,
        [before.status],
        { status: to, ...extra },
        tx,
      );
      if (changed === 0) {
        throw new ConflictException(
          'La licencia fue modificada por otra operación. Actualizá la pantalla.',
        );
      }
      if (before.type === 'VACATION') {
        await this.leavesRepository.adjustBalance(
          tenantId,
          before.employeeId,
          before.startDate.getUTCFullYear(),
          balanceDelta(before.status, to, before.days),
          tx,
        );
      }
    });

    const after = await this.getLeave(tenantId, id);
    this.eventEmitter.emit(`hr.leave.${to.toLowerCase()}`, {
      tenantId,
      leaveId: id,
    });
    this.audit(
      tenantId,
      userId,
      `leave.${to.toLowerCase()}`,
      id,
      before,
      after,
    );
    return after;
  }

  private async getEmployee(tenantId: string, employeeId: string) {
    const employee = await this.employeesRepository.findById(
      tenantId,
      employeeId,
    );
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    return employee;
  }

  private async getLeave(tenantId: string, id: string) {
    const leave = await this.leavesRepository.findById(tenantId, id);
    if (!leave) throw new NotFoundException('Licencia no encontrada');
    return leave;
  }

  private audit(
    tenantId: string,
    userId: string | undefined,
    action: string,
    resourceId: string,
    before?: unknown,
    after?: unknown,
  ) {
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'hr',
      action,
      resourceId,
      before,
      after,
    } satisfies AuditLogEvent);
  }
}

const STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'pendiente',
  APPROVED: 'aprobada',
  REJECTED: 'rechazada',
  CANCELLED: 'cancelada',
};

/** Movimiento del saldo de vacaciones para cada transición. */
export function balanceDelta(
  from: LeaveStatus,
  to: LeaveStatus,
  days: number,
): { taken?: number; pending?: number } {
  if (from === 'PENDING' && to === 'APPROVED') {
    return { pending: -days, taken: days };
  }
  if (from === 'PENDING') return { pending: -days }; // rechazada o cancelada
  if (from === 'APPROVED' && to === 'CANCELLED') return { taken: -days };
  return {};
}

function toView(balance: {
  employeeId: string;
  year: number;
  entitled: number;
  taken: number;
  pending: number;
}): LeaveBalanceView {
  return {
    employeeId: balance.employeeId,
    year: balance.year,
    entitled: balance.entitled,
    taken: balance.taken,
    pending: balance.pending,
    available: Math.max(balance.entitled - balance.taken - balance.pending, 0),
  };
}

function toCalendarDay(iso: string): Date {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
