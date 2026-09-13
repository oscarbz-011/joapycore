import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogEvent } from './audit-log.event';
import { FilterAuditDto } from './dto/filter-audit.dto';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: AuditLogEvent) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        module: data.module,
        action: data.action,
        resourceId: data.resourceId,
        before: data.before ?? undefined,
        after: data.after ?? undefined,
        ipAddress: data.ipAddress,
      },
    });
  }

  async findAll(tenantId: string, filters: FilterAuditDto) {
    const page = Number(filters.page ?? 1);
    const limit = Math.min(Number(filters.limit ?? 50), 100);
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(filters.module && { module: filters.module }),
      ...(filters.action && { action: { contains: filters.action } }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.resourceId && { resourceId: filters.resourceId }),
      ...((filters.dateFrom || filters.dateTo) && {
        createdAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
