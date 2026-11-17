import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantPool } from './tenant-pool';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: TenantPool;

  constructor(configService: ConfigService) {
    const pool = new TenantPool({
      connectionString: configService.get<string>('DATABASE_URL'),
      // Release idle connections so stale ones don't accumulate after a DB restart
      idleTimeoutMillis: 10_000,
      // Fail fast if no connection is available instead of waiting indefinitely
      connectionTimeoutMillis: 5_000,
      max: 10,
    });

    // Without this handler, a connection that dies emits an unhandled error event
    // and can leave the pool in an inconsistent state after a DB restart.
    pool.on('error', (err) => {
      this.logger.warn(`pg pool connection error: ${err.message}`);
    });

    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    await this.warnIfPrivileged();
  }

  async warnIfPrivileged() {
    try {
      const [role] = await this.$queryRaw<
        {
          name: string;
          superuser: boolean;
          bypassRls: boolean;
          canCreate: boolean;
          ownsTables: boolean;
        }[]
      >`SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS "bypassRls",
          has_schema_privilege('public', 'CREATE') AS "canCreate",
          EXISTS (SELECT 1 FROM pg_tables
                  WHERE schemaname = 'public' AND tableowner = current_user) AS "ownsTables"
        FROM pg_roles WHERE rolname = current_user`;
      if (!role) return;

      // El dueño de una tabla también se saltea sus políticas de filas.
      const reasons = [
        role.superuser && 'es superusuario',
        role.bypassRls && 'se saltea las políticas de filas',
        role.ownsTables && 'es dueño de las tablas',
        role.canCreate && 'puede crear tablas',
      ].filter(Boolean);
      if (reasons.length === 0) return;

      this.logger.warn(
        `La app se conecta como "${role.name}", que ${reasons.join(', ')}. Crear un usuario sin privilegios con pnpm db:app-role.`,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudieron revisar los privilegios del usuario de la base: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
