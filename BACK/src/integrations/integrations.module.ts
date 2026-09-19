import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { ImapConnectionService } from './imap-connection.service';
import { IntegrationsRepository } from './integrations.repository';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController],
  providers: [
    IntegrationsRepository,
    IntegrationsService,
    ImapConnectionService,
  ],
  exports: [IntegrationsService, ImapConnectionService],
})
export class IntegrationsModule {}
