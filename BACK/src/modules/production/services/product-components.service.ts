import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProductKind } from '@prisma/client';
import { ProductComponentsRepository } from '../repositories/product-components.repository';
import { CreateProductComponentDto } from '../dto/create-product-component.dto';
import { UpdateProductComponentDto } from '../dto/update-product-component.dto';

@Injectable()
export class ProductComponentsService {
  constructor(private readonly repository: ProductComponentsRepository) {}

  async findByProduct(tenantId: string, productId: string) {
    await this.getProductOrFail(tenantId, productId);
    return this.repository.findByProduct(tenantId, productId);
  }

  async addComponent(
    tenantId: string,
    productId: string,
    dto: CreateProductComponentDto,
  ) {
    const product = await this.getProductOrFail(tenantId, productId);

    // La receta describe cómo se fabrica algo: sobre un producto de reventa no
    // significa nada, y sería una forma silenciosa de romper el modelo.
    if (product.kind !== ProductKind.MANUFACTURED) {
      throw new UnprocessableEntityException(
        `Solo un producto fabricado puede tener receta. "${product.name}" está marcado como ${product.kind === ProductKind.RESALE ? 'de reventa' : 'materia prima'}.`,
      );
    }

    if (dto.componentId === productId) {
      throw new UnprocessableEntityException(
        'Un producto no puede ser componente de sí mismo',
      );
    }

    const component = await this.getProductOrFail(tenantId, dto.componentId);

    const existing = await this.repository.findExisting(
      tenantId,
      productId,
      dto.componentId,
    );
    if (existing) {
      throw new ConflictException(
        `"${component.name}" ya está en la receta. Editá su cantidad en vez de agregarlo de nuevo.`,
      );
    }

    await this.assertNoCycle(tenantId, productId, dto.componentId);

    return this.repository.create(tenantId, {
      productId,
      componentId: dto.componentId,
      quantity: dto.quantity,
      notes: dto.notes,
    });
  }

  async updateComponent(
    tenantId: string,
    productId: string,
    id: string,
    dto: UpdateProductComponentDto,
  ) {
    await this.getComponentOrFail(tenantId, id);
    await this.repository.update(tenantId, id, dto);
    return this.repository.findOne(tenantId, id);
  }

  async removeComponent(tenantId: string, productId: string, id: string) {
    await this.getComponentOrFail(tenantId, id);
    await this.repository.delete(tenantId, id);
  }

  // Impide que la receta se cierre sobre sí misma (A lleva B, B lleva A, o más
  // largo). Sin esto, calcular el costo o explotar la receta de una orden de
  // producción entraría en recursión infinita.
  private async assertNoCycle(
    tenantId: string,
    productId: string,
    componentId: string,
  ) {
    const visited = new Set<string>();
    const pending = [componentId];

    while (pending.length) {
      const current = pending.pop()!;
      if (current === productId) {
        throw new UnprocessableEntityException(
          'Ese componente crea un ciclo en la receta: el producto terminaría siendo insumo de sí mismo',
        );
      }
      if (visited.has(current)) continue;
      visited.add(current);

      const children = await this.repository.findComponentIds(
        tenantId,
        current,
      );
      pending.push(...children.map((c) => c.componentId));
    }
  }

  private async getProductOrFail(tenantId: string, id: string) {
    const product = await this.repository.findProduct(tenantId, id);
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  private async getComponentOrFail(tenantId: string, id: string) {
    const found = await this.repository.findOne(tenantId, id);
    if (!found) throw new NotFoundException('Componente no encontrado');
    return found;
  }
}
