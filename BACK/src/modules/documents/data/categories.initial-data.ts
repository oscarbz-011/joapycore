import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InitialData } from '../../../initial-data/initial-data.registry';
import type {
  InitialDataItem,
  InitialDataSet,
} from '../../../initial-data/initial-data.types';
import { DocumentCategoriesRepository } from '../repositories/document-categories.repository';
import { DOCUMENT_CATEGORIES_DATA } from './categories.data';

@Injectable()
@InitialData()
export class DocumentCategoriesInitialData implements InitialDataSet {
  readonly definition = DOCUMENT_CATEGORIES_DATA;

  constructor(private readonly categories: DocumentCategoriesRepository) {}

  async existingKeys(tenantId: string, tx: Prisma.TransactionClient) {
    return new Set(await this.categories.allNames(tenantId, tx));
  }

  async create(
    tenantId: string,
    items: readonly InitialDataItem[],
    tx: Prisma.TransactionClient,
  ) {
    await this.categories.createNames(
      tenantId,
      items.map((item) => item.key),
      tx,
    );
  }
}
