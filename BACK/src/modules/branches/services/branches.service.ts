import { Injectable, NotFoundException } from '@nestjs/common';
import { BranchesRepository } from '../repositories/branches.repository';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly branchesRepository: BranchesRepository) {}

  findAll(tenantId: string) {
    return this.branchesRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const branch = await this.branchesRepository.findById(tenantId, id);
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }

  create(tenantId: string, dto: CreateBranchDto) {
    return this.branchesRepository.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto) {
    await this.findOne(tenantId, id);
    return this.branchesRepository.update(tenantId, id, dto);
  }
}
