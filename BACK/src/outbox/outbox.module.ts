import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { TenantsModule } from '../tenants/tenants.module';
import { OutboxConsumersRegistry } from './outbox-consumers.registry';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [DiscoveryModule, TenantsModule],
  providers: [OutboxRepository, OutboxService, OutboxConsumersRegistry],
  exports: [OutboxService],
})
export class OutboxModule {}
