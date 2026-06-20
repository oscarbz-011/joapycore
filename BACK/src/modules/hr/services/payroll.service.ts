import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PayrollRepository } from '../repositories/payroll.repository';
import { EmployeesRepository } from '../repositories/employees.repository';
import { UpdatePayrollConfigDto } from '../dto/payroll-config.dto';

const DEFAULT_IPS_EMPLOYEE = 0.09;
const DEFAULT_IPS_EMPLOYER = 0.165;

@Injectable()
export class PayrollService {
  constructor(
    private readonly payrollRepository: PayrollRepository,
    private readonly employeesRepository: EmployeesRepository,
  ) {}

  getConfig(tenantId: string) {
    return this.payrollRepository.getConfig(tenantId);
  }

  updateConfig(tenantId: string, dto: UpdatePayrollConfigDto) {
    return this.payrollRepository.upsertConfig(tenantId, {
      minimumWage: dto.minimumWage ?? 0,
      ipsEmployeeRate: dto.ipsEmployeeRate ?? DEFAULT_IPS_EMPLOYEE,
      ipsEmployerRate: dto.ipsEmployerRate ?? DEFAULT_IPS_EMPLOYER,
    });
  }

  listRecords(tenantId: string) {
    return this.payrollRepository.findRecords(tenantId);
  }

  async getRecord(tenantId: string, id: string) {
    const record = await this.payrollRepository.findRecord(tenantId, id);
    if (!record) throw new NotFoundException('Liquidación no encontrada');
    return record;
  }

  async runPayroll(tenantId: string, period: string) {
    const existing = await this.payrollRepository.findRecords(tenantId);
    if (existing.find((r) => r.period === period)) {
      throw new UnprocessableEntityException(`Ya existe una liquidación para el período ${period}`);
    }

    const config = await this.payrollRepository.getConfig(tenantId);
    const ipsEmployeeRate = Number(config?.ipsEmployeeRate ?? DEFAULT_IPS_EMPLOYEE);
    const ipsEmployerRate = Number(config?.ipsEmployerRate ?? DEFAULT_IPS_EMPLOYER);

    const employees = await this.employeesRepository.findAll(tenantId);
    const activeEmployees = employees.filter((e) => e.isActive && !e.terminationDate);

    const record = await this.payrollRepository.createRecord({
      tenantId,
      period,
      status: 'DRAFT',
    });

    const isDecember = period.endsWith('-12');

    for (const emp of activeEmployees) {
      const baseSalary = emp.baseSalary;
      const aguinaldo = isDecember ? Math.round(baseSalary / 12) : 0;
      const grossSalary = baseSalary + aguinaldo;
      const ipsEmployee = Math.round(baseSalary * ipsEmployeeRate);
      const ipsEmployer = Math.round(baseSalary * ipsEmployerRate);
      const netSalary = grossSalary - ipsEmployee;

      await this.payrollRepository.createItem({
        payrollRecordId: record.id,
        employeeId: emp.id,
        baseSalary,
        grossSalary,
        aguinaldo,
        ipsEmployee,
        ipsEmployer,
        netSalary,
      });
    }

    return this.payrollRepository.findRecord(tenantId, record.id);
  }

  async markPaid(tenantId: string, id: string) {
    const record = await this.getRecord(tenantId, id);
    if (record.status === 'PAID') {
      throw new UnprocessableEntityException('La liquidación ya fue pagada');
    }
    await this.payrollRepository.updateRecord(tenantId, id, {
      status: 'PAID',
      paidAt: new Date(),
    });
    return this.getRecord(tenantId, id);
  }
}
