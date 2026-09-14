import { Module } from '@nestjs/common';
import { ReportsController } from './controllers/reports.controller';
import { ReportsRepository } from './repositories/reports.repository';
import { ReportsService } from './services/reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
