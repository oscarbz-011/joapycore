import { Module } from '@nestjs/common';
import { AlertsController } from './controllers/alerts.controller';
import { AlertsRepository } from './repositories/alerts.repository';
import { AlertsService } from './services/alerts.service';

@Module({
  controllers: [AlertsController],
  providers: [AlertsService, AlertsRepository],
  exports: [AlertsService],
})
export class AlertsModule {}
