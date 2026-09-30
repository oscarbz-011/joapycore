import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ApplicationEmailRepository } from './application-email.repository';
import { ApplicationEmailService } from './application-email.service';
import { ApplicationsController } from './applications.controller';

@Module({
  imports: [EmailModule, IntegrationsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationEmailRepository, ApplicationEmailService],
})
export class ApplicationsModule {}
