import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FilesService } from '../../files/files.service';
import { TenantsRepository } from '../repositories/tenants.repository';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly filesService: FilesService,
  ) {}

  async getById(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async update(tenantId: string, dto: UpdateTenantDto) {
    const tenant = await this.getById(tenantId);
    const { actividadesEconomicas, timbradoFecha, timbradoFechaFin, ...rest } = dto;
    const data: Prisma.TenantUncheckedUpdateInput = {
      ...rest,
      ...(actividadesEconomicas !== undefined
        ? {
            actividadesEconomicas:
              actividadesEconomicas as unknown as Prisma.InputJsonValue,
          }
        : {}),
      // @IsDateString() acepta "2026-07-16" (sin componente de hora) — Prisma
      // exige un DateTime completo, hay que convertirlo antes de persistir.
      ...(timbradoFecha !== undefined
        ? { timbradoFecha: new Date(timbradoFecha) }
        : {}),
      ...(timbradoFechaFin !== undefined
        ? { timbradoFechaFin: new Date(timbradoFechaFin) }
        : {}),
    };
    const updated = await this.tenantsRepository.update(tenantId, data);

    // Si se reemplaza o quita el logo, el FileRecord viejo queda huérfano —
    // se borra después de guardar el nuevo valor. Best-effort: no debe hacer
    // fallar la actualización del tenant si el archivo ya no existe.
    const oldLogoFileId = tenant.logoFileId;
    if (
      dto.logoFileId !== undefined &&
      oldLogoFileId &&
      oldLogoFileId !== dto.logoFileId
    ) {
      try {
        await this.filesService.delete(tenantId, oldLogoFileId);
      } catch (error) {
        this.logger.warn(
          `No se pudo borrar el logo anterior (${oldLogoFileId}) del tenant ${tenantId}: ${(error as Error).message}`,
        );
      }
    }

    return updated;
  }
}
