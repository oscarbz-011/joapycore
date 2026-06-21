/**
 * One-time backfill: creates AccountsReceivable records for all ISSUED invoices
 * that don't already have one. Run after adding the PaymentsModule to an
 * existing database that already has issued invoices.
 *
 * Usage: npx ts-node prisma/backfill-accounts-receivable.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'ISSUED',
      accountsReceivable: null,
    },
    select: { id: true, tenantId: true, total: true, dueDate: true },
  });

  console.log(`Found ${invoices.length} issued invoice(s) without AccountsReceivable`);

  for (const invoice of invoices) {
    await prisma.accountsReceivable.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        amount: invoice.total,
        dueDate: invoice.dueDate ?? undefined,
      },
    });
    console.log(`  Created AR for invoice ${invoice.id} — amount: ${invoice.total}`);
  }

  await prisma.$disconnect();
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
