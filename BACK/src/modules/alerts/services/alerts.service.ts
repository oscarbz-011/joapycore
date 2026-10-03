import { Injectable } from '@nestjs/common';
import { AlertType } from '@prisma/client';
import { AlertsRepository } from '../repositories/alerts.repository';
import { UpsertAlertDto } from '../dto/upsert-alert.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly alertsRepository: AlertsRepository) {}

  findAll(tenantId: string) {
    return this.alertsRepository.findAll(tenantId);
  }

  /** Umbral de una alerta activa del tenant; null si está apagada o sin umbral. */
  async findActiveThreshold(
    tenantId: string,
    type: AlertType,
  ): Promise<number | null> {
    const config = await this.alertsRepository.findByType(tenantId, type);
    return config?.isActive ? (config.threshold ?? null) : null;
  }

  upsert(tenantId: string, dto: UpsertAlertDto) {
    return this.alertsRepository.upsert(tenantId, {
      tenantId,
      type: dto.type,
      channel: dto.channel,
      isActive: dto.isActive,
      threshold: dto.threshold,
    });
  }
}
