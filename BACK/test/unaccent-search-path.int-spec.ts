/**
 * Integración contra PostgreSQL real: la búsqueda sin acentos tiene que
 * funcionar con el search_path vacío que usa pg_restore. Si no, un respaldo
 * de la base no recrea clientes ni productos (sus columnas search_text usan
 * esta función).
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';

describe('immutable_unaccent (PostgreSQL)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('removes accents with an empty search_path, as during a restore', async () => {
    const [row] = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('search_path', '', true)`);
      return tx.$queryRawUnsafe<{ value: string }[]>(
        `SELECT public.immutable_unaccent('Benítez Ñandutí') AS value`,
      );
    });

    expect(row.value).toBe('Benitez Nanduti');
  });
});
