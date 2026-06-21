import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditListener } from './audit.listener';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditRepository, AuditListener],
  exports: [AuditService],
})
export class AuditModule {}
