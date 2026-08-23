import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CreatePosTerminalData {
  branchId: string;
  name: string;
}

export interface UpdatePosTerminalData {
  name?: string;
  isActive?: boolean;
}

@Injectable()
export class PosTerminalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return { branch: { select: { id: true, name: true } } };
  }

  findAll(tenantId: string) {
    return this.prisma.posTerminal.findMany({
      where: { tenantId },
      include: this.include,
      orderBy: [{ isActive: 'desc' as const }, { name: 'asc' as const }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.posTerminal.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  create(tenantId: string, data: CreatePosTerminalData) {
    return this.prisma.posTerminal.create({
      data: { tenantId, ...data },
      include: this.include,
    });
  }

  update(tenantId: string, id: string, data: UpdatePosTerminalData) {
    return this.prisma.posTerminal.update({
      where: { id },
      data,
      include: this.include,
    });
  }
}
