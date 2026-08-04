import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AreasRepository } from '../repositories/areas.repository';
import { toUpperNorm } from '../../../common/utils/normalize.util';

@Injectable()
export class AreasService {
  constructor(private readonly areasRepository: AreasRepository) {}

  list(tenantId: string) {
    return this.areasRepository.findAll(tenantId);
  }

  async create(tenantId: string, data: { name: string; parentId?: string }) {
    return this.areasRepository.create(tenantId, { ...data, name: toUpperNorm(data.name) }).catch(() => {
      throw new ConflictException('Ya existe un área con ese nombre');
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: { name?: string; parentId?: string; isActive?: boolean },
  ) {
    const area = await this.areasRepository.findById(tenantId, id);
    if (!area) throw new NotFoundException('Área no encontrada');
    await this.areasRepository.update(tenantId, id, data.name ? { ...data, name: toUpperNorm(data.name) } : data);
    return this.areasRepository.findById(tenantId, id);
  }
}
