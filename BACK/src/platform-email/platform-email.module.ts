import { Module } from '@nestjs/common';
import { PlatformEmailController } from './platform-email.controller';
import { PlatformEmailRepository } from './platform-email.repository';
import { PlatformEmailService } from './platform-email.service';
import { ResendClient } from './resend.client';
import { SmtpPlatformClient } from './smtp-platform.client';

@Module({
  controllers: [PlatformEmailController],
  providers: [
    PlatformEmailRepository,
    PlatformEmailService,
    ResendClient,
    SmtpPlatformClient,
  ],
  exports: [PlatformEmailService],
})
export class PlatformEmailModule {}
