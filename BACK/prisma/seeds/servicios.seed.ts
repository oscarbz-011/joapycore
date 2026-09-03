import type { PrismaClient } from '@prisma/client';
import {
  createDemoTenant,
  customerCode,
  employeeCode,
  findExistingDemoTenantId,
} from './helpers';

const OWNER_EMAIL = 'owner@servicios.demo';

// Rubro sin 'inventory'/'procurement' activos (ver MODULE_TEMPLATES) — no
// tiene sentido sembrar productos ni proveedores acá.
export async function seedServicios(prisma: PrismaClient) {
  const existingId = await findExistingDemoTenantId(prisma, OWNER_EMAIL);
  if (existingId) {
    return { industry: 'servicios', ownerEmail: OWNER_EMAIL, skipped: true };
  }

  const { tenant, branch } = await createDemoTenant(prisma, {
    name: 'Consultora Paraguay Soluciones',
    industry: 'servicios',
    ownerEmail: OWNER_EMAIL,
    ownerFirstName: 'Verónica',
    ownerLastName: 'Insfrán',
    razonSocial: 'Paraguay Soluciones Consultora SRL',
    ruc: '80043210-9',
    phone: '021-993456',
  });

  const customerNames = [
    ['Estudio Jurídico', 'Ayala & Asociados'],
    ['Constructora', 'del Este SA'],
    ['Alicia', 'Bogado'],
    ['Farmacia', 'Central SRL'],
    ['Emilio', 'Ferreira'],
    ['Colegio', 'San Ignacio'],
  ];
  for (let i = 0; i < customerNames.length; i++) {
    const [firstName, lastName] = customerNames[i];
    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        customerCode: customerCode(i + 1),
        firstName,
        lastName,
        documentType: i % 2 === 0 ? 'RUC' : 'CI',
        documentNumber: String(3_800_000 + i * 1111),
        phone: `09${61 + i}-${400000 + i}`,
        city: 'Asunción',
      },
    });
  }

  const areaConsultoria = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Consultoría' },
  });
  const areaRecepcion = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Recepción' },
  });
  const areaAdmin = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Administración' },
  });
  const areaGerencia = await prisma.area.create({
    data: { tenantId: tenant.id, name: 'Gerencia' },
  });

  const posConsultor = await prisma.position.create({
    data: {
      tenantId: tenant.id,
      name: 'Consultor',
      areaId: areaConsultoria.id,
    },
  });
  const posRecepcion = await prisma.position.create({
    data: {
      tenantId: tenant.id,
      name: 'Recepcionista',
      areaId: areaRecepcion.id,
    },
  });
  const posAdmin = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Administrativo', areaId: areaAdmin.id },
  });
  const posGerente = await prisma.position.create({
    data: { tenantId: tenant.id, name: 'Gerente', areaId: areaGerencia.id },
  });

  const employees = [
    {
      firstName: 'Bruno',
      lastName: 'Segovia',
      doc: '4500001',
      position: posConsultor.id,
      area: areaConsultoria.id,
      salary: 5_500_000,
    },
    {
      firstName: 'Ana',
      lastName: 'Coronel',
      doc: '4500002',
      position: posRecepcion.id,
      area: areaRecepcion.id,
      salary: 2_600_000,
    },
    {
      firstName: 'Walter',
      lastName: 'Giménez',
      doc: '4500003',
      position: posAdmin.id,
      area: areaAdmin.id,
      salary: 3_400_000,
    },
    {
      firstName: 'Verónica',
      lastName: 'Ríos',
      doc: '4500004',
      position: posGerente.id,
      area: areaGerencia.id,
      salary: 7_000_000,
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
        birthDate: new Date(1983 + i, 8, 12),
        hireDate: new Date(2022, 3, 1 + i),
        areaId: e.area,
        positionId: e.position,
        branchId: branch.id,
        baseSalary: e.salary,
      },
    });
  }

  return { industry: 'servicios', ownerEmail: OWNER_EMAIL, skipped: false };
}
