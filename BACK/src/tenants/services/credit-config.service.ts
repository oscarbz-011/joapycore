import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditConfigRepository } from '../repositories/credit-config.repository';
import { CreateCreditPlanDto } from '../dto/create-credit-plan.dto';
import { UpdateCreditPlanDto } from '../dto/update-credit-plan.dto';
import { CreateInterestComponentDto } from '../dto/create-interest-component.dto';
import { UpdateInterestComponentDto } from '../dto/update-interest-component.dto';

@Injectable()
export class CreditConfigService {
  constructor(private readonly repo: CreditConfigRepository) {}

  get(tenantId: string) {
    return this.repo.findByTenant(tenantId);
  }

  setEnabled(
    tenantId: string,
    isEnabled: boolean,
    maxIncomePercentage?: number | null,
    dueDayOfMonth?: number,
    moraGraceDays?: number,
    delinquencyThresholdMonths?: number | null,
  ) {
    return this.repo.upsertConfig(
      tenantId,
      isEnabled,
      maxIncomePercentage,
      dueDayOfMonth,
      moraGraceDays,
      delinquencyThresholdMonths,
    );
  }

  async addComponent(tenantId: string, dto: CreateInterestComponentDto) {
    // Mismo criterio que addPlan: lee isEnabled actual antes de upsertear
    // para no pisarlo solo por agregar un componente de interés.
    const existing = await this.repo.findByTenant(tenantId);
    const config = await this.repo.upsertConfig(
      tenantId,
      existing?.isEnabled ?? false,
    );
    return this.repo.createComponent(tenantId, config.id, dto);
  }

  async updateComponent(
    tenantId: string,
    componentId: string,
    dto: UpdateInterestComponentDto,
  ) {
    const config = await this.repo.findByTenant(tenantId);
    const exists = config?.interestComponents.find((c) => c.id === componentId);
    if (!exists)
      throw new NotFoundException('Componente de interés no encontrado');
    return this.repo.updateComponent(componentId, dto);
  }

  async removeComponent(tenantId: string, componentId: string) {
    const config = await this.repo.findByTenant(tenantId);
    const exists = config?.interestComponents.find((c) => c.id === componentId);
    if (!exists)
      throw new NotFoundException('Componente de interés no encontrado');
    await this.repo.deleteComponent(componentId);
  }

  async addPlan(tenantId: string, dto: CreateCreditPlanDto) {
    const existing = await this.repo.findByTenant(tenantId);
    const config = await this.repo.upsertConfig(
      tenantId,
      existing?.isEnabled ?? false,
    );
    const duplicate = config.plans.find(
      (p) => p.installments === dto.installments,
    );
    if (duplicate) {
      throw new ConflictException(
        `Ya existe un plan de ${dto.installments} cuotas`,
      );
    }
    return this.repo.createPlan(config.id, dto.installments, dto.interestRate);
  }

  async updatePlan(tenantId: string, planId: string, dto: UpdateCreditPlanDto) {
    const config = await this.repo.findByTenant(tenantId);
    const exists = config?.plans.find((p) => p.id === planId);
    if (!exists) throw new NotFoundException('Plan de crédito no encontrado');
    return this.repo.updatePlan(planId, dto);
  }

  async removePlan(tenantId: string, planId: string) {
    const config = await this.repo.findByTenant(tenantId);
    const exists = config?.plans.find((p) => p.id === planId);
    if (!exists) throw new NotFoundException('Plan de crédito no encontrado');
    await this.repo.deletePlan(planId);
  }
}
