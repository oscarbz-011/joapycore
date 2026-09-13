/**
 * Integración contra PostgreSQL real: verifica que el advisory lock de
 * assertStockAvailable serialice dos ventas simultáneas de la última unidad.
 * Un test unitario con mocks no puede probar esto.
 *
 * Requiere DATABASE_URL apuntando a una base con al menos un tenant.
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertStockAvailable } from '../src/common/utils/stock-availability.util';

describe('assertStockAvailable (PostgreSQL)', () => {
  let prisma: PrismaService;
  let tenantId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    tenantId = tenant.id;
    const product = await prisma.product.create({
      data: {
        tenantId,
        name: `TEST lock ${randomUUID()}`,
        status: 'ACTIVE',
      },
    });
    productId = product.id;
    await prisma.stockMovement.create({
      data: { tenantId, productId, type: 'IN', quantity: 1 },
    });
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { tenantId, productId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.$disconnect();
  });

  const sellOne = () =>
    prisma.$transaction(async (tx) => {
      await assertStockAvailable(tx, tenantId, [{ productId, quantity: 1, name: 'Última unidad' }]);
      // Ventana amplia entre leer y escribir: sin lock, ambas pasarían.
      await new Promise((r) => setTimeout(r, 300));
      await tx.stockMovement.create({
        data: { tenantId, productId, type: 'OUT', quantity: -1 },
      });
    });

  it('lets only one of two concurrent sales take the last unit', async () => {
    const results = await Promise.allSettled([sellOne(), sellOne()]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String((failed[0] as PromiseRejectedResult).reason)).toContain(
      'No hay stock suficiente de: Última unidad (disponible 0, pedido 1)',
    );

    const total = await prisma.stockMovement.aggregate({
      where: { tenantId, productId },
      _sum: { quantity: true },
    });
    expect(total._sum.quantity).toBe(0);
  });
});
