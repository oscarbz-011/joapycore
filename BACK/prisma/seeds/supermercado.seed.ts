import { Industry, type PrismaClient } from '@prisma/client';
import {
  createDemoTenant,
  customerCode,
  employeeCode,
  findExistingDemoTenantId,
} from './helpers';

const OWNER_EMAIL = 'owner@supermercado.demo';

export async function seedSupermercado(prisma: PrismaClient) {
  const existingId = await findExistingDemoTenantId(prisma, OWNER_EMAIL);
  if (existingId) {
    return { industry: 'supermercado', ownerEmail: OWNER_EMAIL, skipped: true };
  }

  const { tenant, branch } = await createDemoTenant(prisma, {
    name: 'Supermercado La Económica',
    industry: Industry.SUPERMERCADO,
    ownerEmail: OWNER_EMAIL,
    ownerFirstName: 'Nélida',
    ownerLastName: 'Acosta',
    razonSocial: 'Supermercado La Económica SA',
    ruc: '80054321-1',
    phone: '021-882345',
  });

  const categoryNames = [
    'Almacén',
    'Bebidas',
    'Limpieza',
    'Lácteos',
    'Panificados',
  ];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const c = await prisma.category.create({
      data: { tenantId: tenant.id, name },
    });
    categories.set(name, c.id);
  }

  const products = [
    { name: 'Arroz 1kg', category: 'Almacén', cost: 4_500, sale: 6_500 },
    {
      name: 'Fideo tallarín 500g',
      category: 'Almacén',
      cost: 3_800,
      sale: 5_500,
    },
    {
      name: 'Aceite de girasol 900ml',
      category: 'Almacén',
      cost: 9_500,
      sale: 13_500,
    },
    { name: 'Azúcar 1kg', category: 'Almacén', cost: 4_200, sale: 6_000 },
    { name: 'Yerba mate 500g', category: 'Almacén', cost: 8_500, sale: 12_500 },
    {
      name: 'Gaseosa cola 2.25L',
      category: 'Bebidas',
      cost: 8_000,
      sale: 11_500,
    },
    {
      name: 'Agua mineral sin gas 1.5L',
      category: 'Bebidas',
      cost: 3_500,
      sale: 5_500,
    },
    {
      name: 'Jugo de naranja 1L',
      category: 'Bebidas',
      cost: 6_500,
      sale: 9_500,
    },
    {
      name: 'Detergente líquido 750ml',
      category: 'Limpieza',
      cost: 7_500,
      sale: 11_000,
    },
    { name: 'Lavandina 1L', category: 'Limpieza', cost: 4_000, sale: 6_000 },
    {
      name: 'Papel higiénico (4 rollos)',
      category: 'Limpieza',
      cost: 9_000,
      sale: 13_500,
    },
    { name: 'Leche entera 1L', category: 'Lácteos', cost: 6_000, sale: 8_500 },
    {
      name: 'Queso Paraguay 500g',
      category: 'Lácteos',
      cost: 15_000,
      sale: 21_000,
    },
    {
      name: 'Yogur bebible 1L',
      category: 'Lácteos',
      cost: 8_500,
      sale: 12_000,
    },
    {
      name: 'Pan francés (kg)',
      category: 'Panificados',
      cost: 7_000,
      sale: 10_000,
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
        stockInitial: 100,
      },
    });
  }

  const customerNames = [
    ['Gloria', 'Martínez'],
    ['Sebastián', 'López'],
    ['Ninfa', 'Chávez'],
    ['Rubén', 'Torales'],
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
        documentNumber: String(3_700_000 + i * 1111),
        phone: `09${91 + i}-${300000 + i}`,
        city: 'San Lorenzo',
      },
    });
  }

  await prisma.supplier.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'Distribuidora de Alimentos del Paraguay',
        contactName: 'Osvaldo Bareiro',
        paymentTermDays: 15,
      },
      {
        tenantId: tenant.id,
        name: 'Lácteos San José SA',
        contactName: 'Mirna Zárate',
        paymentTermDays: 7,
      },
    ],
  });

  const areaVentas = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Ventas' },
  });
  const areaDeposito = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Depósito' },
  });

  const posCajero = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Cajero', areaId: areaVentas.id },
  });
  const posReponedor = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Reponedor', areaId: areaDeposito.id },
  });
  const posEncargado = await prisma.position.create({
    data: {
      tenantId: tenant.id,
      name: 'Encargado de tienda',
      areaId: areaVentas.id,
    },
  });

  const employees = [
    {
      firstName: 'Yolanda',
      lastName: 'Espínola',
      doc: '4400001',
      position: posCajero.id,
      area: areaVentas.id,
      salary: 2_800_000,
    },
    {
      firstName: 'Derlis',
      lastName: 'Aquino',
      doc: '4400002',
      position: posReponedor.id,
      area: areaDeposito.id,
      salary: 2_600_000,
    },
    {
      firstName: 'Cynthia',
      lastName: 'Domínguez',
      doc: '4400003',
      position: posEncargado.id,
      area: areaVentas.id,
      salary: 3_800_000,
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
        birthDate: new Date(1990 + i, 2, 8),
        hireDate: new Date(2024, 2, 1 + i),
        areaId: e.area,
        positionId: e.position,
        branchId: branch.id,
        baseSalary: e.salary,
      },
    });
  }

  // 'pos' está activo para este rubro — se siembra 1 terminal para que el
  // módulo POS tenga algo que listar al entrar por primera vez.
  await prisma.posTerminal.create({
    data: { tenantId: tenant.id, branchId: branch.id, name: 'Caja 1' },
  });

  return { industry: 'supermercado', ownerEmail: OWNER_EMAIL, skipped: false };
}
