import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { FilterAuditDto } from './dto/filter-audit.dto';

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  findAll(tenantId: string, filters: FilterAuditDto) {
    return this.auditRepository.findAll(tenantId, filters);
  }
}
