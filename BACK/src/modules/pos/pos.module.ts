import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { PosSalesController } from './controllers/pos-sales.controller';
import { PosSessionsController } from './controllers/pos-sessions.controller';
import { PosTerminalsController } from './controllers/pos-terminals.controller';
import { PosSalesRepository } from './repositories/pos-sales.repository';
import { PosSessionsRepository } from './repositories/pos-sessions.repository';
import { PosTerminalsRepository } from './repositories/pos-terminals.repository';
import { PosSalesService } from './services/pos-sales.service';
import { PosSessionsService } from './services/pos-sessions.service';
import { PosTerminalsService } from './services/pos-terminals.service';

@Module({
  imports: [SalesModule],
  controllers: [
    PosTerminalsController,
    PosSessionsController,
    PosSalesController,
  ],
  providers: [
    PosTerminalsService,
    PosSessionsService,
    PosSalesService,
    PosTerminalsRepository,
    PosSessionsRepository,
    PosSalesRepository,
  ],
})
export class PosModule {}
