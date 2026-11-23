import { Injectable, Logger } from '@nestjs/common';
import { Industry } from '@prisma/client';
import { OnDomainEvent } from '../common/events/on-domain-event.decorator';
import type { DomainEvents } from '../common/events/domain-events';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { TenantModulesRepository } from '../tenants/repositories/tenant-modules.repository';
import { InitialDataRegistry } from './initial-data.registry';
import { InitialDataRepository } from './initial-data.repository';
import {
  latestVersion,
  type InitialDataItem,
  type InitialDataSet,
} from './initial-data.types';

const TENANT_CHUNK_SIZE = 200;
const MAX_TENANT_CHUNKS = 500;

@Injectable()
export class InitialDataService {
  private readonly logger = new Logger(InitialDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: InitialDataRegistry,
    private readonly repository: InitialDataRepository,
    private readonly tenantModules: TenantModulesRepository,
  ) {}

  @OnDomainEvent('tenant.registered', {
    consumer: 'initial-data.tenant-registered',
    suppressErrors: false,
  })
  onTenantRegistered(event: DomainEvents['tenant.registered']) {
    return this.applyPending(event.tenantId);
  }

  @OnDomainEvent('tenant.module.activated', {
    consumer: 'initial-data.module-activated',
    suppressErrors: false,
  })
  onModuleActivated(event: DomainEvents['tenant.module.activated']) {
    return this.applyPending(event.tenantId);
  }

  /**
   * Aplica a la empresa lo que le falte de los módulos que tiene activos.
   * Un conjunto que falla no frena a los demás, pero el error se propaga
   * para que el outbox lo reintente.
   */
  async applyPending(tenantId: string): Promise<string[]> {
    const applied = await this.repository.appliedVersions(tenantId);
    const active = new Set(
      await this.tenantModules.findActiveModuleNames(tenantId),
    );
    const pending = this.registry
      .all()
      .filter(
        (set) =>
          active.has(set.definition.module) &&
          (applied.get(set.definition.name) ?? 0) <
            latestVersion(set.definition),
      );
    if (pending.length === 0) return [];

    const industry =
      (await this.repository.industryOf(tenantId)) ?? Industry.OTRO;
    const done: string[] = [];
    const failed: string[] = [];
    for (const set of pending) {
      try {
        await this.applySet(tenantId, industry, set);
        done.push(set.definition.name);
      } catch (error) {
        failed.push(`${set.definition.name}: ${(error as Error).message}`);
      }
    }
    if (failed.length > 0) {
      throw new Error(
        `No se cargaron los datos iniciales ${failed.join('; ')}`,
      );
    }
    return done;
  }

  /** Para las versiones publicadas después de que la empresa ya existía. */
  async applyToAllTenants(): Promise<{ tenants: number; failed: number }> {
    let afterId: string | undefined;
    let tenants = 0;
    let failed = 0;
    for (let chunk = 0; chunk < MAX_TENANT_CHUNKS; chunk++) {
      const ids = await TenantContext.runAsPlatform(() =>
        this.repository.tenantIds(afterId, TENANT_CHUNK_SIZE),
      );
      for (const tenantId of ids) {
        try {
          await TenantContext.run(tenantId, () => this.applyPending(tenantId));
        } catch (error) {
          failed++;
          this.logger.warn(`Empresa ${tenantId}: ${(error as Error).message}`);
        }
      }
      tenants += ids.length;
      if (ids.length < TENANT_CHUNK_SIZE) break;
      afterId = ids[ids.length - 1];
    }
    return { tenants, failed };
  }

  private applySet(
    tenantId: string,
    industry: Industry,
    set: InitialDataSet,
  ): Promise<void> {
    const { definition } = set;
    const latest = latestVersion(definition);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.repository.lockedVersion(
        tx,
        tenantId,
        definition.name,
      );
      if (current >= latest) return;

      const existing = await set.existingKeys(tenantId, tx);
      const keepTheirs =
        current === 0 &&
        definition.whenExisting === 'keep' &&
        existing.size > 0;
      if (!keepTheirs) {
        const items = newItems(definition.versions, current, industry).filter(
          (item) => !existing.has(item.key),
        );
        if (items.length > 0) await set.create(tenantId, items, tx);
      }
      await this.repository.saveVersion(tx, tenantId, definition.name, latest);
    });
  }
}

function newItems<T extends InitialDataItem>(
  versions: readonly { version: number; items: readonly T[] }[],
  after: number,
  industry: Industry,
): T[] {
  const byKey = new Map<string, T>();
  for (const version of versions) {
    if (version.version <= after) continue;
    for (const item of version.items) {
      if (item.industries && !item.industries.includes(industry)) continue;
      if (!byKey.has(item.key)) byKey.set(item.key, item);
    }
  }
  return [...byKey.values()];
}
