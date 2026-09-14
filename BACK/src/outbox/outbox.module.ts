import { Global, Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxRepository, OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
