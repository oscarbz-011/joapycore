import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import {
  USER_ACCOUNTS,
  type UserAccounts,
} from '../../../common/contracts/user-accounts.contract';
import { EmployeesRepository } from '../repositories/employees.repository';
import { HrSourcesRepository } from '../repositories/hr-sources.repository';
import { PositionsRepository } from '../repositories/positions.repository';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toTitleCase } from '../../../common/utils/normalize.util';
import {
  SESSION_INVALIDATE_EVENT,
  type SessionInvalidateEvent,
} from '../../../common/events/session-invalidate.event';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly employeesRepository: EmployeesRepository,
    // Solo para abrir transacciones; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventBus,
    @Inject(USER_ACCOUNTS) private readonly accounts: UserAccounts,
    private readonly positionsRepository: PositionsRepository,
    private readonly sources: HrSourcesRepository,
  ) {}

  list(tenantId: string) {
    return this.employeesRepository.findAll(tenantId);
  }

  async getById(tenantId: string, id: string) {
    const employee = await this.employeesRepository.findById(tenantId, id);
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async create(tenantId: string, dto: CreateEmployeeDto) {
    const holder = await this.employeesRepository.findByDocument(
      tenantId,
      dto.documentType,
      dto.documentNumber,
    );
    if (holder) {
      throw new ConflictException(
        `Ya hay un empleado con el documento ${dto.documentType} ${dto.documentNumber}: ${holder.firstName} ${holder.lastName}`,
      );
    }

    const employeeNumber =
      await this.employeesRepository.nextEmployeeNumber(tenantId);
    const employeeCode = await this.generateEmployeeCode(
      tenantId,
      dto.branchId,
      employeeNumber,
    );

    const firstName = toTitleCase(dto.firstName);
    const lastName = toTitleCase(dto.lastName);

    return this.prisma.$transaction(async (tx) => {
      let userId: string | undefined;
      let tempPassword: string | undefined;

      if (dto.email) {
        const roleId = dto.positionId
          ? await this.positionsRepository.findRoleId(
              tenantId,
              dto.positionId,
              tx,
            )
          : null;
        const account = await this.accounts.createWithTempPassword(
          tx,
          tenantId,
          {
            email: dto.email,
            firstName,
            lastName,
            branchId: dto.branchId,
            roleId,
          },
        );
        userId = account.userId;
        tempPassword = account.tempPassword;
      }

      const employee = await this.employeesRepository.create(
        {
          tenantId,
          employeeNumber,
          employeeCode,
          userId,
          firstName,
          lastName,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          ci: dto.ci,
          ipsNumber: dto.ipsNumber,
          ruc: dto.ruc,
          birthDate: new Date(dto.birthDate),
          gender: dto.gender,
          nationality: dto.nationality,
          maritalStatus: dto.maritalStatus,
          phone: dto.phone,
          mobilePhone: dto.mobilePhone,
          address: dto.address,
          city: dto.city,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
          emergencyContactRelation: dto.emergencyContactRelation,
          hireDate: new Date(dto.hireDate),
          contractType: dto.contractType,
          isCourier: dto.isCourier ?? false,
          areaId: dto.areaId,
          positionId: dto.positionId,
          managerId: dto.managerId,
          branchId: dto.branchId,
          baseSalary: dto.baseSalary,
          paymentMethod: dto.paymentMethod,
          bankName: dto.bankName,
          bankAccount: dto.bankAccount,
        },
        tx,
      );

      this.eventEmitter.emit('audit.log', {
        tenantId,
        module: 'hr',
        action: 'employee.created',
        resourceId: employee.id,
        after: { employeeNumber, email: dto.email },
      });

      return { employee, tempPassword };
    });
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.getById(tenantId, id);
    const updated = await this.employeesRepository.update(tenantId, id, {
      ...dto,
      ...(dto.firstName ? { firstName: toTitleCase(dto.firstName) } : {}),
      ...(dto.lastName ? { lastName: toTitleCase(dto.lastName) } : {}),
      ...(dto.birthDate ? { birthDate: new Date(dto.birthDate) } : {}),
    });

    // Las ventas resuelven la sucursal desde User.branchId, no desde
    // Employee.branchId — hay que mantenerlos en sincronía si el empleado
    // tiene una cuenta de usuario vinculada.
    if (dto.branchId !== undefined && employee.userId) {
      await this.accounts.setBranch(
        tenantId,
        employee.userId,
        dto.branchId || null,
      );
    }

    return updated;
  }

  async terminate(tenantId: string, id: string, terminationDate?: string) {
    const employee = await this.getById(tenantId, id);

    if (employee.terminationDate) {
      throw new UnprocessableEntityException('El empleado ya fue dado de baja');
    }

    const date = terminationDate ? new Date(terminationDate) : new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.employeesRepository.terminate(tenantId, id, date, tx);

      if (employee.userId) {
        await this.accounts.deactivate(tx, tenantId, employee.userId);
      }
    });
    if (employee.userId) {
      this.eventEmitter.emit(SESSION_INVALIDATE_EVENT, {
        userId: employee.userId,
      } satisfies SessionInvalidateEvent);
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'hr',
      action: 'employee.terminated',
      resourceId: id,
      after: { terminationDate: date },
    });

    return this.getById(tenantId, id);
  }

  async resetUserPassword(
    tenantId: string,
    id: string,
  ): Promise<{ tempPassword: string }> {
    const employee = await this.getById(tenantId, id);
    if (!employee.userId) {
      throw new UnprocessableEntityException(
        'Este empleado no tiene usuario del sistema vinculado',
      );
    }

    const { tempPassword } = await this.accounts.resetTempPassword(
      tenantId,
      employee.userId,
    );
    this.eventEmitter.emit(SESSION_INVALIDATE_EVENT, {
      userId: employee.userId,
    } satisfies SessionInvalidateEvent);

    return { tempPassword };
  }

  async linkUser(tenantId: string, id: string, email: string) {
    await this.getById(tenantId, id);

    const existing = await this.accounts.findByEmail(email);
    if (!existing)
      throw new NotFoundException('Usuario no encontrado con ese email');
    if (existing.tenantId !== tenantId)
      throw new ConflictException('El usuario no pertenece a este tenant');

    const alreadyLinked = await this.employeesRepository.findByUserId(
      existing.id,
    );
    if (alreadyLinked)
      throw new ConflictException(
        'Ese usuario ya está vinculado a otro empleado',
      );

    await this.employeesRepository.linkUser(tenantId, id, existing.id);
    return this.getById(tenantId, id);
  }

  private async generateEmployeeCode(
    tenantId: string,
    branchId: string | undefined | null,
    employeeNumber: number,
  ): Promise<string> {
    let branchNum = '00';
    if (branchId) {
      const branchIds = await this.sources.findBranchIdsInOrder(tenantId);
      const idx = branchIds.indexOf(branchId);
      if (idx >= 0) branchNum = String(idx + 1).padStart(2, '0');
    }
    return `EMP-${branchNum}-${String(employeeNumber).padStart(6, '0')}`;
  }
}
