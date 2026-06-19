import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BrandsRepository } from '../repositories/brands.repository';
import { CreateBrandDto } from '../dto/create-brand.dto';
import { UpdateBrandDto } from '../dto/update-brand.dto';

@Injectable()
export class BrandsService {
  constructor(private readonly brandsRepository: BrandsRepository) {}

  findAll(tenantId: string) {
    return this.brandsRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const brand = await this.brandsRepository.findById(tenantId, id);
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async create(tenantId: string, dto: CreateBrandDto) {
    const existing = await this.brandsRepository.findByName(tenantId, dto.name);
    if (existing) throw new ConflictException('Brand already exists');
    return this.brandsRepository.create(tenantId, dto.name);
  }

  async update(tenantId: string, id: string, dto: UpdateBrandDto) {
    await this.findOne(tenantId, id);
    await this.brandsRepository.update(tenantId, id, dto);
    return this.brandsRepository.findById(tenantId, id);
  }
}
