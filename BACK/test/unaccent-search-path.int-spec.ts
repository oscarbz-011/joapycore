/**
 * Integración contra PostgreSQL real: la búsqueda sin acentos tiene que
 * funcionar con el search_path vacío que usa pg_restore. Si no, un respaldo
 * de la base no recrea clientes ni productos (sus columnas search_text usan
 * esta función).
 *
 * CI crea el schema con `prisma db push`, que no corre el SQL de las
 * migraciones: la prueba lo aplica ella misma y deshace todo al terminar.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const MIGRATION = join(
  __dirname,
  '../prisma/migrations/20261126100000_unaccent_search_path/migration.sql',
);

const describeWithOwner = process.env.MIGRATE_DATABASE_URL
  ? describe
  : describe.skip;

describeWithOwner('immutable_unaccent (PostgreSQL)', () => {
  const owner = new Client({
    connectionString: process.env.MIGRATE_DATABASE_URL,
  });

  beforeAll(async () => {
    await owner.connect();
    await owner.query('BEGIN');
    await owner.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await owner.query(readFileSync(MIGRATION, 'utf8'));
  });

  afterAll(async () => {
    await owner.query('ROLLBACK');
    await owner.end();
  });

  it('removes accents with an empty search_path, as during a restore', async () => {
    await owner.query(`SELECT set_config('search_path', '', true)`);
    const { rows } = await owner.query<{ value: string }>(
      `SELECT public.immutable_unaccent('Benítez Ñandutí') AS value`,
    );

    expect(rows[0].value).toBe('Benitez Nanduti');
  });
});
