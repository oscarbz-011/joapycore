import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(configService: ConfigService) {
    const pool = new Pool({
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
    const [role] = await this.$queryRaw<
      { name: string; superuser: boolean; bypassRls: boolean }[]
    >`SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS "bypassRls"
      FROM pg_roles WHERE rolname = current_user`;
    if (!role || (!role.superuser && !role.bypassRls)) return;

    this.logger.warn(
      `La app se conecta como "${role.name}", que es superusuario o se saltea las políticas de filas. Crear un usuario sin privilegios con pnpm db:app-role.`,
    );
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
