import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PlatformEmailModule } from '../platform-email/platform-email.module';

@Module({
  imports: [IntegrationsModule, PlatformEmailModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
