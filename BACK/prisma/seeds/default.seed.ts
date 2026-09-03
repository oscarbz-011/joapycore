import type { PrismaClient } from '@prisma/client';
import {
  createDemoTenant,
  customerCode,
  employeeCode,
  findExistingDemoTenantId,
} from './helpers';

const OWNER_EMAIL = 'owner@default.demo';

// 'default' es el template de fallback (no representa un rubro real, se usa
// cuando un tenant se registra sin elegir uno) — datos deliberadamente
// genéricos, no ambientados en ningún comercio en particular.
export async function seedDefault(prisma: PrismaClient) {
  const existingId = await findExistingDemoTenantId(prisma, OWNER_EMAIL);
  if (existingId) {
    return { industry: 'default', ownerEmail: OWNER_EMAIL, skipped: true };
  }

  const { tenant, branch } = await createDemoTenant(prisma, {
    name: 'Comercial Genérica SA',
    industry: 'default',
    ownerEmail: OWNER_EMAIL,
    ownerFirstName: 'Pedro',
    ownerLastName: 'Alonso',
    razonSocial: 'Comercial Genérica SA',
    ruc: '80012340-5',
    phone: '021-554321',
  });

  const categoryNames = ['General', 'Ofertas'];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const c = await prisma.category.create({
      data: { tenantId: tenant.id, name },
    });
    categories.set(name, c.id);
  }

  const products = [
    {
      name: 'Producto genérico A',
      category: 'General',
      cost: 50_000,
      sale: 80_000,
    },
    {
      name: 'Producto genérico B',
      category: 'General',
      cost: 70_000,
      sale: 110_000,
    },
    {
      name: 'Producto genérico C',
      category: 'General',
      cost: 30_000,
      sale: 50_000,
    },
    {
      name: 'Producto genérico D',
      category: 'General',
      cost: 120_000,
      sale: 180_000,
    },
    {
      name: 'Producto en oferta E',
      category: 'Ofertas',
      cost: 25_000,
      sale: 35_000,
    },
    {
      name: 'Producto en oferta F',
      category: 'Ofertas',
      cost: 40_000,
      sale: 55_000,
    },
    {
      name: 'Producto genérico G',
      category: 'General',
      cost: 90_000,
      sale: 140_000,
    },
    {
      name: 'Producto genérico H',
      category: 'General',
      cost: 60_000,
      sale: 95_000,
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
        stockInitial: 25,
      },
    });
  }

  const customerNames = [
    ['Juan', 'Pérez'],
    ['Ana', 'García'],
    ['Luis', 'Rodríguez'],
    ['Marta', 'Fernández'],
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
        documentNumber: String(3_900_000 + i * 1111),
        phone: `09${51 + i}-${500000 + i}`,
        city: 'Asunción',
      },
    });
  }

  await prisma.supplier.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'Proveedor Genérico Uno',
        paymentTermDays: 15,
      },
      {
        tenantId: tenant.id,
        name: 'Proveedor Genérico Dos',
        paymentTermDays: 0,
      },
    ],
  });

  const areaVentas = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Ventas' },
  });
  const posVendedor = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Vendedor', areaId: areaVentas.id },
  });
  const posAdmin = await prisma.position.create({
    data: {
      tenantId: tenant.id,
      name: 'Administrativo',
      areaId: areaVentas.id,
    },
  });

  const employees = [
    {
      firstName: 'Sandra',
      lastName: 'Vera',
      doc: '4600001',
      position: posVendedor.id,
      area: areaVentas.id,
      salary: 3_000_000,
    },
    {
      firstName: 'Óscar',
      lastName: 'Mendoza',
      doc: '4600002',
      position: posAdmin.id,
      area: areaVentas.id,
      salary: 3_200_000,
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
        birthDate: new Date(1992 + i, 6, 5),
        hireDate: new Date(2024, 5, 1 + i),
        areaId: e.area,
        positionId: e.position,
        branchId: branch.id,
        baseSalary: e.salary,
      },
    });
  }

  return { industry: 'default', ownerEmail: OWNER_EMAIL, skipped: false };
}
