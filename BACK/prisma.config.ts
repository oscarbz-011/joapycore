import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // Las migraciones corren con el dueño de las tablas; la app, con su
    // propio usuario sin privilegios (pnpm db:app-role).
    url: process.env.MIGRATE_DATABASE_URL || env<Env>('DATABASE_URL'),
  },
});
