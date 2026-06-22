import { Injectable } from '@nestjs/common';
import { AlertsRepository } from '../repositories/alerts.repository';
import { UpsertAlertDto } from '../dto/upsert-alert.dto';

@Injectable()
export class AlertsService {
  constructor(private readonly alertsRepository: AlertsRepository) {}

  findAll(tenantId: string) {
    return this.alertsRepository.findAll(tenantId);
  }

  upsert(tenantId: string, dto: UpsertAlertDto) {
    return this.alertsRepository.upsert(tenantId, {
      tenantId,
      type:      dto.type,
      channel:   dto.channel,
      isActive:  dto.isActive,
      threshold: dto.threshold,
    });
  }
}
