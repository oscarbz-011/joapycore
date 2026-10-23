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

  /** Lo que cualquier usuario ve de su empresa en el menú. */
  async brand(tenantId: string) {
    const tenant = await this.getById(tenantId);
    return {
      id: tenant.id,
      name: tenant.nombreFantasia?.trim() || tenant.name,
      razonSocial: tenant.razonSocial,
      ruc: tenant.ruc,
      hasLogo: Boolean(tenant.logoFileId),
    };
  }

  async logo(tenantId: string) {
    const tenant = await this.getById(tenantId);
    if (!tenant.logoFileId) throw new NotFoundException('Sin logo');
    const record = await this.filesService.getById(tenantId, tenant.logoFileId);
    // Solo una imagen: este endpoint no exige permiso de archivos.
    if (!record.mimeType.startsWith('image/')) {
      throw new NotFoundException('Sin logo');
    }
    return {
      mimeType: record.mimeType,
      content: await this.filesService.getFileBuffer(record),
    };
  }

  async update(tenantId: string, dto: UpdateTenantDto) {
    const tenant = await this.getById(tenantId);
    const { actividadesEconomicas, ...rest } = dto;
    const data: Prisma.TenantUncheckedUpdateInput = {
      ...rest,
      ...(actividadesEconomicas !== undefined
        ? {
            actividadesEconomicas:
              actividadesEconomicas as unknown as Prisma.InputJsonValue,
          }
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
