import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InitialData } from '../../../initial-data/initial-data.registry';
import type { InitialDataSet } from '../../../initial-data/initial-data.types';
import { DocumentsRepository } from '../repositories/documents.repository';
import {
  BILLING_TEMPLATES_DATA,
  type BillingTemplateItem,
} from './billing-templates.data';

@Injectable()
@InitialData()
export class BillingTemplatesInitialData implements InitialDataSet<BillingTemplateItem> {
  readonly definition = BILLING_TEMPLATES_DATA;

  constructor(private readonly documents: DocumentsRepository) {}

  async existingKeys(tenantId: string, tx: Prisma.TransactionClient) {
    return new Set<string>(await this.documents.templateKinds(tenantId, tx));
  }

  async create(
    tenantId: string,
    items: readonly BillingTemplateItem[],
    tx: Prisma.TransactionClient,
  ) {
    await this.documents.createMany(
      items.map((item) => ({
        tenantId,
        type: 'BILLING' as const,
        title: item.title,
        description: item.description,
        visibility: 'PUBLIC' as const,
        isTemplate: true,
        templateKind: item.key,
        contentFormat: 'HTML' as const,
        content: item.content,
      })),
      tx,
    );
  }
}
