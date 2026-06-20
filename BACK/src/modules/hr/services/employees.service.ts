import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { EmployeesRepository } from '../repositories/employees.repository';
import { CreateEmployeeDto } from '../dto/create-employee.dto';
import { UpdateEmployeeDto } from '../dto/update-employee.dto';
import { PrismaService } from '../../../prisma/prisma.service';

const SALT_ROUNDS = 10;

function generateTempPassword(): string {
  // 10-char alphanumeric, URL-safe
  return crypto.randomBytes(8).toString('base64url').slice(0, 10);
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly employeesRepository: EmployeesRepository,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
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
    const employeeNumber = await this.employeesRepository.nextEmployeeNumber(tenantId);

    return this.prisma.$transaction(async (tx) => {
      let userId: string | undefined;
      let tempPassword: string | undefined;

      if (dto.email) {
        const existing = await tx.user.findUnique({ where: { email: dto.email } });
        if (existing) throw new ConflictException('El email ya está en uso');

        tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

        const user = await tx.user.create({
          data: {
            tenantId,
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            mustChangePassword: true,
          },
        });
        userId = user.id;
      }

      const employee = await tx.employee.create({
        data: {
          tenantId,
          employeeNumber,
          userId,
          firstName: dto.firstName,
          lastName: dto.lastName,
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
          areaId: dto.areaId,
          positionId: dto.positionId,
          managerId: dto.managerId,
          baseSalary: dto.baseSalary,
          paymentMethod: dto.paymentMethod,
          bankName: dto.bankName,
          bankAccount: dto.bankAccount,
        },
        include: {
          user: { select: { id: true, email: true, status: true, mustChangePassword: true } },
          area: { select: { id: true, name: true } },
          position: { select: { id: true, name: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      });

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
    await this.getById(tenantId, id);
    return this.employeesRepository.update(tenantId, id, {
      ...dto,
      ...(dto.birthDate ? { birthDate: new Date(dto.birthDate) } : {}),
    });
  }

  async terminate(tenantId: string, id: string, terminationDate?: string) {
    const employee = await this.getById(tenantId, id);

    if (employee.terminationDate) {
      throw new UnprocessableEntityException('El empleado ya fue dado de baja');
    }

    const date = terminationDate ? new Date(terminationDate) : new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.updateMany({
        where: { id, tenantId },
        data: { terminationDate: date, isActive: false },
      });

      if (employee.userId) {
        await tx.user.updateMany({
          where: { id: employee.userId },
          data: { status: 'INACTIVE' },
        });
      }
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'hr',
      action: 'employee.terminated',
      resourceId: id,
      after: { terminationDate: date },
    });

    return this.getById(tenantId, id);
  }

  async resetUserPassword(tenantId: string, id: string): Promise<{ tempPassword: string }> {
    const employee = await this.getById(tenantId, id);
    if (!employee.userId) {
      throw new UnprocessableEntityException('Este empleado no tiene usuario del sistema vinculado');
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: employee.userId },
      data: { passwordHash, mustChangePassword: true },
    });

    return { tempPassword };
  }

  async linkUser(tenantId: string, id: string, email: string) {
    await this.getById(tenantId, id);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) throw new NotFoundException('Usuario no encontrado con ese email');
    if (existing.tenantId !== tenantId) throw new ConflictException('El usuario no pertenece a este tenant');

    const alreadyLinked = await this.employeesRepository.findByUserId(existing.id);
    if (alreadyLinked) throw new ConflictException('Ese usuario ya está vinculado a otro empleado');

    await this.employeesRepository.linkUser(tenantId, id, existing.id);
    return this.getById(tenantId, id);
  }
}
