import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { separateBatchesByTenant } from './tenant-batching';
import { TenantPool } from './tenant-pool';
import { unprotectedTenantTables } from './tenant-rls';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: TenantPool;
  private readonly production: boolean;
  private readonly enforceTenants: boolean;

  constructor(configService: ConfigService) {
    // Interruptor de emergencia: apaga el filtro por empresa sin migraciones.
    const enforceTenants = configService.get<string>('TENANT_RLS') !== 'off';
    const pool = new TenantPool({
      enforceTenants,
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
    separateBatchesByTenant(this);
    this.pool = pool;
    this.production = configService.get<string>('NODE_ENV') === 'production';
    this.enforceTenants = enforceTenants;
  }

  async onModuleInit() {
    await this.$connect();
    if (!this.enforceTenants) {
      this.logger.error(
        'TENANT_RLS=off: las consultas no se filtran por empresa en la base.',
      );
    }
    await this.warnIfPrivileged();
    await this.checkTenantRls();
  }

  /** En producción no arranca si una tabla de empresa quedó sin seguridad de filas. */
  async checkTenantRls() {
    if (!this.enforceTenants) return;
    let tables: string[];
    try {
      tables = await unprotectedTenantTables(this.pool);
    } catch (error) {
      this.logger.warn(
        `No se pudo revisar la seguridad de filas: ${(error as Error).message}`,
      );
      return;
    }
    if (tables.length === 0) return;
    const message = `${tables.length} tabla(s) con tenant_id sin seguridad de filas (${tables.slice(0, 5).join(', ')}${tables.length > 5 ? ', …' : ''}). Correr pnpm db:tenant-rls.`;
    if (this.production) throw new Error(message);
    this.logger.warn(message);
  }

  /** En producción no arranca con un usuario que se saltea la seguridad de filas. */
  async warnIfPrivileged() {
    let message: string | undefined;
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
      message = `La app se conecta como "${role.name}", que ${reasons.join(', ')}. Crear un usuario sin privilegios con pnpm db:app-role.`;
    } catch (error) {
      this.logger.warn(
        `No se pudieron revisar los privilegios del usuario de la base: ${(error as Error).message}`,
      );
      return;
    }
    if (this.production) throw new Error(message);
    this.logger.warn(message);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
