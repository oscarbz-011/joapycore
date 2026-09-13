import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriesRepository } from '../repositories/categories.repository';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { toUpperNorm } from '../../../common/utils/normalize.util';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  findAll(tenantId: string) {
    return this.categoriesRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const category = await this.categoriesRepository.findById(tenantId, id);
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    const name = toUpperNorm(dto.name);
    const existing = await this.prismaCheck(tenantId, name);
    if (existing) throw new ConflictException('Category already exists');
    return this.categoriesRepository.create(tenantId, name);
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(tenantId, id);
    await this.categoriesRepository.update(
      tenantId,
      id,
      dto.name ? { ...dto, name: toUpperNorm(dto.name) } : dto,
    );
    return this.categoriesRepository.findById(tenantId, id);
  }

  private prismaCheck(tenantId: string, name: string) {
    return this.categoriesRepository
      .findAll(tenantId)
      .then((cats) =>
        cats.find((c) => c.name.toUpperCase() === name.toUpperCase()),
      );
  }
}
