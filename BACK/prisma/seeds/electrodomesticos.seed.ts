import { Industry, type PrismaClient } from '@prisma/client';
import {
  createDemoTenant,
  customerCode,
  employeeCode,
  findExistingDemoTenantId,
} from './helpers';

const OWNER_EMAIL = 'owner@electrodomesticos.demo';

export async function seedElectrodomesticos(prisma: PrismaClient) {
  const existingId = await findExistingDemoTenantId(prisma, OWNER_EMAIL);
  if (existingId) {
    return {
      industry: 'electrodomesticos',
      ownerEmail: OWNER_EMAIL,
      skipped: true,
    };
  }

  const { tenant, branch, warehouse } = await createDemoTenant(prisma, {
    name: 'Electro Hogar Paraguay',
    industry: Industry.ELECTRODOMESTICOS,
    ownerEmail: OWNER_EMAIL,
    ownerFirstName: 'Marta',
    ownerLastName: 'Duarte',
    razonSocial: 'Electro Hogar Paraguay SA',
    ruc: '80098765-4',
    phone: '021-660123',
  });

  // ── Categorías + productos ─────────────────────────────────────────────
  const categoryNames = [
    'Heladeras',
    'Lavarropas',
    'TV / Audio',
    'Climatización',
    'Pequeños electrodomésticos',
  ];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const c = await prisma.category.create({
      data: { tenantId: tenant.id, name },
    });
    categories.set(name, c.id);
  }

  const products: {
    name: string;
    category: string;
    cost: number;
    sale: number;
    isSerialized?: boolean;
  }[] = [
    {
      name: 'Heladera SAMSUNG 400L No Frost',
      category: 'Heladeras',
      cost: 3_200_000,
      sale: 4_500_000,
      isSerialized: true,
    },
    {
      name: 'Heladera LG 320L',
      category: 'Heladeras',
      cost: 2_600_000,
      sale: 3_700_000,
      isSerialized: true,
    },
    {
      name: 'Freezer WHIRLPOOL 200L',
      category: 'Heladeras',
      cost: 1_800_000,
      sale: 2_600_000,
      isSerialized: true,
    },
    {
      name: 'Lavarropas SAMSUNG 8kg Carga Frontal',
      category: 'Lavarropas',
      cost: 2_100_000,
      sale: 3_100_000,
      isSerialized: true,
    },
    {
      name: 'Lavarropas WHIRLPOOL 7kg',
      category: 'Lavarropas',
      cost: 1_700_000,
      sale: 2_500_000,
      isSerialized: true,
    },
    {
      name: 'Smart TV LG 55" 4K',
      category: 'TV / Audio',
      cost: 2_800_000,
      sale: 3_900_000,
      isSerialized: true,
    },
    {
      name: 'Smart TV SAMSUNG 43" 4K',
      category: 'TV / Audio',
      cost: 1_900_000,
      sale: 2_700_000,
      isSerialized: true,
    },
    {
      name: 'Equipo de audio PHILIPS 500W',
      category: 'TV / Audio',
      cost: 850_000,
      sale: 1_300_000,
    },
    {
      name: 'Aire Acondicionado SAMSUNG 12000 BTU',
      category: 'Climatización',
      cost: 2_400_000,
      sale: 3_400_000,
      isSerialized: true,
    },
    {
      name: 'Ventilador de pie PHILIPS',
      category: 'Climatización',
      cost: 220_000,
      sale: 380_000,
    },
    {
      name: 'Microondas WHIRLPOOL 20L',
      category: 'Pequeños electrodomésticos',
      cost: 420_000,
      sale: 650_000,
    },
    {
      name: 'Licuadora PHILIPS 600W',
      category: 'Pequeños electrodomésticos',
      cost: 180_000,
      sale: 320_000,
    },
  ];
  for (const p of products) {
    await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: categories.get(p.category),
        name: p.name,
        unit: 'unidad',
        costPrice: p.cost,
        salePrice: p.sale,
        isSerialized: p.isSerialized ?? false,
        stockInitial: p.isSerialized ? 0 : 15,
      },
    });
  }

  // ── Clientes ────────────────────────────────────────────────────────────
  const customerNames = [
    ['María', 'González'],
    ['Carlos', 'Benítez'],
    ['Rosa', 'Villalba'],
    ['Diego', 'Ortiz'],
    ['Laura', 'Cáceres'],
    ['Fernando', 'Ayala'],
  ];
  for (let i = 0; i < customerNames.length; i++) {
    const [firstName, lastName] = customerNames[i];
    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        customerCode: customerCode(i + 1),
        firstName,
        lastName,
        documentType: 'CI',
        documentNumber: String(3_500_000 + i * 1111),
        phone: `09${71 + i}-${100000 + i}`,
        city: 'Asunción',
        monthlyIncome: 3_500_000 + i * 250_000,
        economicActivity: 'ASALARIADO',
      },
    });
  }

  // ── Proveedores ─────────────────────────────────────────────────────────
  await prisma.supplier.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'Importadora Central SA',
        contactName: 'Ruth Fernández',
        email: 'ruth@importadoracentral.com.py',
        isImporter: true,
        paymentTermDays: 30,
      },
      {
        tenantId: tenant.id,
        name: 'Distribuidora Electro Sur',
        contactName: 'Pablo Ramírez',
        phone: '021-445566',
        paymentTermDays: 15,
      },
      {
        tenantId: tenant.id,
        name: 'Repuestos y Accesorios Paraguay',
        contactName: 'Nadia Peralta',
        paymentTermDays: 0,
      },
    ],
  });

  // ── Áreas / Posiciones / Empleados ─────────────────────────────────────
  const areaVentas = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Ventas' },
  });
  const areaCobranzas = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Cobranzas' },
  });
  const areaAdmin = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Administración' },
  });

  const posVendedor = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Vendedor', areaId: areaVentas.id },
  });
  const posCobrador = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Cobrador', areaId: areaCobranzas.id },
  });
  const posAdmin = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Administrativo', areaId: areaAdmin.id },
  });

  const employees = [
    {
      firstName: 'Armando',
      lastName: 'Pérez',
      doc: '4200001',
      position: posVendedor.id,
      area: areaVentas.id,
      salary: 3_800_000,
      isCourier: false,
    },
    {
      firstName: 'José',
      lastName: 'Benegas',
      doc: '4200002',
      position: posCobrador.id,
      area: areaCobranzas.id,
      salary: 3_500_000,
      isCourier: true,
    },
    {
      firstName: 'Claudia',
      lastName: 'Pérez',
      doc: '4200003',
      position: posAdmin.id,
      area: areaAdmin.id,
      salary: 4_200_000,
      isCourier: false,
    },
  ];
  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    const employeeNumber = i + 1;
    await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeNumber,
        employeeCode: employeeCode(employeeNumber),
        firstName: e.firstName,
        lastName: e.lastName,
        documentNumber: e.doc,
        birthDate: new Date(1988 + i, 3, 15),
        hireDate: new Date(2024, 0, 10 + i),
        areaId: e.area,
        positionId: e.position,
        branchId: branch.id,
        baseSalary: e.salary,
        isCourier: e.isCourier,
      },
    });
  }

  // ── Configuración de crédito: plan + componentes de interés ────────────
  const creditConfig = await prisma.creditConfig.create({
    data: {
      tenantId: tenant.id,
      isEnabled: true,
      maxIncomePercentage: 30,
      dueDayOfMonth: 5,
      moraGraceDays: 5,
      delinquencyThresholdDays: 90,
    },
  });
  await prisma.creditPlan.create({
    data: {
      creditConfigId: creditConfig.id,
      installments: 6,
      interestRate: 15,
    },
  });
  await prisma.interestComponent.createMany({
    data: [
      {
        tenantId: tenant.id,
        creditConfigId: creditConfig.id,
        name: 'Gastos administrativos',
        frequency: 'ONE_TIME',
        percentage: 5,
        order: 1,
      },
      {
        tenantId: tenant.id,
        creditConfigId: creditConfig.id,
        name: 'Interés moratorio',
        frequency: 'MONTHLY',
        percentage: 10,
        cumulative: true,
        order: 2,
      },
    ],
  });

  void warehouse;
  return {
    industry: Industry.ELECTRODOMESTICOS,
    ownerEmail: OWNER_EMAIL,
    skipped: false,
  };
}
