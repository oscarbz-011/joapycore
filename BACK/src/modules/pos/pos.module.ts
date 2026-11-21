import { Module } from '@nestjs/common';
import { FilesModule } from '../../files/files.module';
import { PosSalesController } from './controllers/pos-sales.controller';
import { PosSessionsController } from './controllers/pos-sessions.controller';
import { PosTerminalsController } from './controllers/pos-terminals.controller';
import { PosSourcesRepository } from './repositories/pos-sources.repository';
import { PosSessionsRepository } from './repositories/pos-sessions.repository';
import { PosTerminalsRepository } from './repositories/pos-terminals.repository';
import { PosSalesService } from './services/pos-sales.service';
import { PosSessionsService } from './services/pos-sessions.service';
import { PosTerminalsService } from './services/pos-terminals.service';

@Module({
  imports: [FilesModule],
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
    PosSourcesRepository,
  ],
})
export class PosModule {}
