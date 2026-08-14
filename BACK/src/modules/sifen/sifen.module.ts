import { Module } from '@nestjs/common';
import { SifenController } from './controllers/sifen.controller';
import { SifenRepository } from './repositories/sifen.repository';
import { SifenService } from './services/sifen.service';

@Module({
  controllers: [SifenController],
  providers: [SifenService, SifenRepository],
  exports: [SifenService],
})
export class SifenModule {}
