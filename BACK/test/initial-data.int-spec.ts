/**
 * Integración contra PostgreSQL de los datos iniciales por módulo: qué recibe
 * una empresa nueva, qué se respeta de una que ya existía, que un módulo
 * apagado no recibe nada y que cada empresa solo ve lo suyo.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { Industry, TemplateKind } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { InitialDataRegistry } from '../src/initial-data/initial-data.registry';
import { InitialDataRepository } from '../src/initial-data/initial-data.repository';
import { InitialDataService } from '../src/initial-data/initial-data.service';
import { BillingTemplatesInitialData } from '../src/modules/documents/data/billing-templates.initial-data';
import { DocumentCategoriesInitialData } from '../src/modules/documents/data/categories.initial-data';
import { DocumentCategoriesRepository } from '../src/modules/documents/repositories/document-categories.repository';
import { DocumentsRepository } from '../src/modules/documents/repositories/documents.repository';
import { InventoryCategoriesInitialData } from '../src/modules/inventory/data/categories.initial-data';
import { CategoriesRepository } from '../src/modules/inventory/repositories/categories.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/prisma/tenant-context';
import { TenantModulesRepository } from '../src/tenants/repositories/tenant-modules.repository';

describe('InitialDataService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: InitialDataService;
  const tenants: string[] = [];

  const asTenant = <T>(tenantId: string, fn: () => Promise<T>) =>
    TenantContext.run(tenantId, fn);
  const asPlatform = <T>(fn: () => Promise<T>) =>
    TenantContext.runAsPlatform(fn);

  async function createTenant(industry: Industry | null, modules: string[]) {
    const id = randomUUID();
    tenants.push(id);
    await asPlatform(async () => {
      await prisma.tenant.create({
        data: { id, name: `Datos iniciales ${id}`, industry },
      });
      await prisma.tenantModule.createMany({
        data: modules.map((moduleName) => ({
          tenantId: id,
          moduleName,
          active: true,
        })),
      });
    });
    return id;
  }

  const categoriesOf = (tenantId: string) =>
    asTenant(tenantId, () =>
      prisma.category
        .findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
        .then((rows) => rows.map((row) => row.name)),
    );
  const documentCategoriesOf = (tenantId: string) =>
    asTenant(tenantId, () =>
      prisma.documentCategory
        .findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { name: 'asc' },
        })
        .then((rows) => rows.map((row) => row.name)),
    );
  const templatesOf = (tenantId: string) =>
    asTenant(tenantId, () =>
      prisma.document
        .findMany({
          where: { tenantId, isTemplate: true },
          orderBy: { templateKind: 'asc' },
        })
        .then((rows) => rows.map((row) => [row.templateKind, row.title])),
    );
  const versionsOf = (tenantId: string) =>
    asTenant(tenantId, () =>
      prisma.tenantModuleData
        .findMany({ where: { tenantId }, orderBy: { dataSet: 'asc' } })
        .then((rows) => rows.map((row) => [row.dataSet, row.version])),
    );
  const apply = (tenantId: string) =>
    asTenant(tenantId, () => service.applyPending(tenantId));

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    const registry = new InitialDataRegistry({} as never, {} as never);
    registry.register(
      new InventoryCategoriesInitialData(new CategoriesRepository(prisma)),
    );
    registry.register(
      new DocumentCategoriesInitialData(
        new DocumentCategoriesRepository(prisma),
      ),
    );
    registry.register(
      new BillingTemplatesInitialData(new DocumentsRepository(prisma)),
    );
    service = new InitialDataService(
      prisma,
      registry,
      new InitialDataRepository(prisma),
      new TenantModulesRepository(prisma),
    );
  });

  afterAll(async () => {
    await asPlatform(async () => {
      const where = { tenantId: { in: tenants } };
      await prisma.document.deleteMany({ where });
      await prisma.documentCategory.deleteMany({ where });
      await prisma.category.deleteMany({ where });
      await prisma.tenantModuleData.deleteMany({ where });
      await prisma.tenantModule.deleteMany({ where });
      await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    });
    await prisma.$disconnect();
  });

  it('gives a new company the data of its active modules once', async () => {
    const tenantId = await createTenant(Industry.SERVICIOS, [
      'inventory',
      'documents',
      'sales',
      'billing',
    ]);

    await expect(apply(tenantId)).resolves.toHaveLength(3);
    await expect(apply(tenantId)).resolves.toEqual([]);

    expect(await categoriesOf(tenantId)).toEqual([
      'Insumos',
      'Repuestos',
      'Servicios',
    ]);
    expect(await documentCategoriesOf(tenantId)).toHaveLength(5);
    expect(await templatesOf(tenantId)).toEqual([
      [TemplateKind.INVOICE, 'Factura (plantilla)'],
      [TemplateKind.PAYMENT_RECEIPT, 'Recibo de dinero (plantilla)'],
    ]);
    expect(await versionsOf(tenantId)).toEqual([
      ['documents.billing-templates', 1],
      ['documents.categories', 1],
      ['inventory.categories', 1],
    ]);
  });

  it('respects what an existing company already had', async () => {
    const tenantId = await createTenant(Industry.SERVICIOS, [
      'inventory',
      'documents',
      'sales',
      'billing',
    ]);
    await asTenant(tenantId, async () => {
      await prisma.category.create({ data: { tenantId, name: 'Mis rubros' } });
      // Dada de baja: cuenta como que la empresa ya tenía su lista.
      await prisma.documentCategory.create({
        data: { tenantId, name: 'Viejos', deletedAt: new Date() },
      });
      await prisma.document.create({
        data: {
          tenantId,
          type: 'BILLING',
          title: 'Mi factura',
          visibility: 'PUBLIC',
          isTemplate: true,
          templateKind: TemplateKind.INVOICE,
          contentFormat: 'HTML',
          content: '<p>propia</p>',
        },
      });
    });

    await apply(tenantId);

    expect(await categoriesOf(tenantId)).toEqual(['Mis rubros']);
    expect(await documentCategoriesOf(tenantId)).toEqual([]);
    expect(await templatesOf(tenantId)).toEqual([
      [TemplateKind.INVOICE, 'Mi factura'],
      [TemplateKind.PAYMENT_RECEIPT, 'Recibo de dinero (plantilla)'],
    ]);
  });

  it('waits until a module is turned on to give it its data', async () => {
    const tenantId = await createTenant(null, ['inventory']);

    await apply(tenantId);
    expect(await categoriesOf(tenantId)).toEqual(['General', 'Otros']);
    expect(await documentCategoriesOf(tenantId)).toEqual([]);

    await asPlatform(() =>
      prisma.tenantModule.create({
        data: { tenantId, moduleName: 'documents', active: true },
      }),
    );
    await expect(apply(tenantId)).resolves.toEqual(['documents.categories']);
    expect(await documentCategoriesOf(tenantId)).toHaveLength(5);
  });

  it('does not duplicate anything when two applications run at once', async () => {
    const tenantId = await createTenant(Industry.FERRETERIA, ['inventory']);

    await Promise.all([apply(tenantId), apply(tenantId), apply(tenantId)]);

    expect(await categoriesOf(tenantId)).toHaveLength(8);
    expect(await versionsOf(tenantId)).toEqual([['inventory.categories', 1]]);
  });

  it('decides each company with its own data only', async () => {
    const other = await createTenant(Industry.OTRO, ['inventory']);
    await asTenant(other, () =>
      prisma.category.create({ data: { tenantId: other, name: 'Ajena' } }),
    );
    const tenantId = await createTenant(Industry.OTRO, ['inventory']);

    await apply(tenantId);

    expect(await categoriesOf(tenantId)).toEqual(['General', 'Otros']);
    expect(await categoriesOf(other)).toEqual(['Ajena']);
    await expect(
      asTenant(tenantId, () =>
        prisma.tenantModuleData.findMany({ where: { tenantId: other } }),
      ),
    ).resolves.toEqual([]);
  });
});
