import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { ApplicationEmailRepository } from './application-email.repository';
import { ApplicationEmailService } from './application-email.service';
import { ApplicationsController } from './applications.controller';

@Module({
  imports: [EmailModule],
  controllers: [ApplicationsController],
  providers: [ApplicationEmailRepository, ApplicationEmailService],
})
export class ApplicationsModule {}
