import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CommunicationsRepository } from './communications.repository';
import { CommunicationsService } from './communications.service';
import { CommunicationsEmailProvider } from './communications-email.provider';
import { CommunicationsWorker } from './communications.worker';
import { CommunicationHubController } from './hub.controller';
import { CommunicationHubService } from './hub.service';
import { InvoiceCommunicationListener } from './invoice-communication.listener';

@Module({
  imports: [FilesModule, IntegrationsModule],
  controllers: [CommunicationHubController],
  providers: [
    CommunicationsRepository,
    CommunicationsService,
    CommunicationsEmailProvider,
    CommunicationsWorker,
    CommunicationHubService,
    InvoiceCommunicationListener,
  ],
})
export class CommunicationHubModule {}
