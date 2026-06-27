import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreditConfigRepository } from '../repositories/credit-config.repository';
import { CreateCreditPlanDto } from '../dto/create-credit-plan.dto';
import { UpdateCreditPlanDto } from '../dto/update-credit-plan.dto';

@Injectable()
export class CreditConfigService {
  constructor(private readonly repo: CreditConfigRepository) {}

  get(tenantId: string) {
    return this.repo.findByTenant(tenantId);
  }

  setEnabled(tenantId: string, isEnabled: boolean) {
    return this.repo.upsertConfig(tenantId, isEnabled);
  }

  async addPlan(tenantId: string, dto: CreateCreditPlanDto) {
    const config = await this.repo.upsertConfig(tenantId, false);
    const duplicate = config.plans.find((p) => p.installments === dto.installments);
    if (duplicate) {
      throw new ConflictException(`Ya existe un plan de ${dto.installments} cuotas`);
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
