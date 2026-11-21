import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  accentVariants,
  normalizeSearch,
} from '../common/pagination/pagination';
import { PrismaService } from '../prisma/prisma.service';

export const CUSTOMER_SUMMARY = {
  id: true,
  customerCode: true,
  firstName: true,
  secondFirstName: true,
  lastName: true,
  secondLastName: true,
  email: true,
  phone: true,
} satisfies Prisma.CustomerSelect;

/**
 * Lecturas de facturas y clientes para Comunicaciones. Sus rutas exigen
 * Facturación activa, que a su vez lleva Ventas.
 */
@Injectable()
export class CommunicationsSourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  invoice(tenantId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { tenantId, id: invoiceId },
      include: {
        tenant: { select: { name: true, razonSocial: true } },
        saleOrder: { include: { customer: true } },
      },
    });
  }

  invoiceCustomer(tenantId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true, saleOrder: { select: { customerId: true } } },
    });
  }

  customer(tenantId: string, id: string) {
    return this.prisma.customer.findFirst({
      where: { tenantId, id },
      select: CUSTOMER_SUMMARY,
    });
  }

  customers(tenantId: string, ids: string[]) {
    return this.prisma.customer.findMany({
      where: { tenantId, id: { in: ids } },
      select: CUSTOMER_SUMMARY,
    });
  }

  async customerIdsMatching(tenantId: string, search: string) {
    const words = search.split(/\s+/).filter(Boolean);
    const rows = await this.prisma.customer.findMany({
      where: {
        tenantId,
        AND: words.map((word) => ({
          OR: [
            { searchText: { contains: normalizeSearch(word) } },
            // Base creada sin migraciones: no tiene ese texto.
            {
              searchText: null,
              OR: accentVariants(word).flatMap((variant) => [
                {
                  firstName: {
                    contains: variant,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  lastName: { contains: variant, mode: 'insensitive' as const },
                },
              ]),
            },
          ],
        })),
      },
      select: { id: true },
      take: 500,
    });
    return rows.map((row) => row.id);
  }
}
