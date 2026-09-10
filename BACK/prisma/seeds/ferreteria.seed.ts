import { Industry, type PrismaClient } from '@prisma/client';
import {
  createDemoTenant,
  customerCode,
  employeeCode,
  findExistingDemoTenantId,
} from './helpers';

const OWNER_EMAIL = 'owner@ferreteria.demo';

export async function seedFerreteria(prisma: PrismaClient) {
  const existingId = await findExistingDemoTenantId(prisma, OWNER_EMAIL);
  if (existingId) {
    return { industry: 'ferreteria', ownerEmail: OWNER_EMAIL, skipped: true };
  }

  const { tenant, branch } = await createDemoTenant(prisma, {
    name: 'Ferretería El Tornillo',
    industry: Industry.FERRETERIA,
    ownerEmail: OWNER_EMAIL,
    ownerFirstName: 'Ricardo',
    ownerLastName: 'Ibáñez',
    razonSocial: 'Ferretería El Tornillo SRL',
    ruc: '80076543-2',
    phone: '021-771234',
  });

  const categoryNames = [
    'Herramientas manuales',
    'Herramientas eléctricas',
    'Tornillería',
    'Pinturas',
    'Materiales de construcción',
  ];
  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const c = await prisma.category.create({
      data: { tenantId: tenant.id, name },
    });
    categories.set(name, c.id);
  }

  const products = [
    {
      name: 'Martillo de uña 16oz',
      category: 'Herramientas manuales',
      cost: 35_000,
      sale: 55_000,
    },
    {
      name: 'Destornillador set 6 piezas',
      category: 'Herramientas manuales',
      cost: 45_000,
      sale: 72_000,
    },
    {
      name: 'Llave inglesa 10"',
      category: 'Herramientas manuales',
      cost: 60_000,
      sale: 95_000,
    },
    {
      name: 'Serrucho STANLEY 20"',
      category: 'Herramientas manuales',
      cost: 55_000,
      sale: 88_000,
    },
    {
      name: 'Taladro percutor BOSCH 650W',
      category: 'Herramientas eléctricas',
      cost: 380_000,
      sale: 590_000,
    },
    {
      name: 'Amoladora angular MAKITA 4.5"',
      category: 'Herramientas eléctricas',
      cost: 320_000,
      sale: 490_000,
    },
    {
      name: 'Sierra circular BLACK+DECKER',
      category: 'Herramientas eléctricas',
      cost: 420_000,
      sale: 650_000,
    },
    {
      name: 'Tornillos autorroscantes 1" (caja 100u)',
      category: 'Tornillería',
      cost: 12_000,
      sale: 22_000,
    },
    {
      name: 'Clavos 2" (kg)',
      category: 'Tornillería',
      cost: 8_000,
      sale: 15_000,
    },
    {
      name: 'Pintura látex blanco 20L',
      category: 'Pinturas',
      cost: 180_000,
      sale: 280_000,
    },
    {
      name: 'Esmalte sintético 1L',
      category: 'Pinturas',
      cost: 35_000,
      sale: 58_000,
    },
    {
      name: 'Cemento Portland 50kg',
      category: 'Materiales de construcción',
      cost: 65_000,
      sale: 92_000,
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
        stockInitial: 40,
      },
    });
  }

  const customerNames = [
    ['Roberto', 'Ovelar'],
    ['Silvia', 'Recalde'],
    ['Hugo', 'Franco'],
    ['Patricia', 'Duarte'],
    ['Andrés', 'Molinas'],
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
        documentNumber: String(3_600_000 + i * 1111),
        phone: `09${81 + i}-${200000 + i}`,
        city: 'Luque',
      },
    });
  }

  await prisma.supplier.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'Ferro Import SA',
        contactName: 'Marcos Villalba',
        isImporter: true,
        paymentTermDays: 30,
      },
      {
        tenantId: tenant.id,
        name: 'Distribuidora del Este',
        contactName: 'Liliana Cardozo',
        paymentTermDays: 15,
      },
      {
        tenantId: tenant.id,
        name: 'Pinturas Paraguayas SA',
        contactName: 'Julio César Mora',
        paymentTermDays: 0,
      },
    ],
  });

  const areaVentas = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Ventas' },
  });
  const areaDeposito = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Depósito' },
  });
  const areaCompras = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Compras' },
  });

  const posVendedor = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Vendedor', areaId: areaVentas.id },
  });
  const posDeposito = await prisma.position.create({
    data: {
      tenantId: tenant.id,
      name: 'Encargado de depósito',
      areaId: areaDeposito.id,
    },
  });
  const posCompras = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Comprador', areaId: areaCompras.id },
  });

  const employees = [
    {
      firstName: 'Mario',
      lastName: 'Sosa',
      doc: '4300001',
      position: posVendedor.id,
      area: areaVentas.id,
      salary: 3_200_000,
    },
    {
      firstName: 'Elva',
      lastName: 'Benítez',
      doc: '4300002',
      position: posDeposito.id,
      area: areaDeposito.id,
      salary: 2_900_000,
    },
    {
      firstName: 'Gustavo',
      lastName: 'Riquelme',
      doc: '4300003',
      position: posCompras.id,
      area: areaCompras.id,
      salary: 3_600_000,
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
        birthDate: new Date(1985 + i, 5, 20),
        hireDate: new Date(2023, 6, 1 + i),
        areaId: e.area,
        positionId: e.position,
        branchId: branch.id,
        baseSalary: e.salary,
      },
    });
  }

  return { industry: 'ferreteria', ownerEmail: OWNER_EMAIL, skipped: false };
}
