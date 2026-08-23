import { Module } from '@nestjs/common';
import { CreditBureauController } from './controllers/credit-bureau.controller';
import { CreditBureauRepository } from './repositories/credit-bureau.repository';
import { CreditBureauChecksService } from './services/credit-bureau-checks.service';
import { CreditBureauConfigService } from './services/credit-bureau-config.service';

@Module({
  controllers: [CreditBureauController],
  providers: [
    CreditBureauConfigService,
    CreditBureauChecksService,
    CreditBureauRepository,
  ],
  exports: [CreditBureauConfigService, CreditBureauChecksService],
})
export class CreditBureauModule {}
