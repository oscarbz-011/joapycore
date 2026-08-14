import { Module } from '@nestjs/common';
import { CobranzasController } from './controllers/cobranzas.controller';
import { CobranzasService } from './services/cobranzas.service';
import { CollectionRoutesRepository } from './repositories/collection-routes.repository';
import { CollectionVisitsRepository } from './repositories/collection-visits.repository';
import { PaymentAgreementsRepository } from './repositories/payment-agreements.repository';
import { CollectionNotesRepository } from './repositories/collection-notes.repository';

@Module({
  controllers: [CobranzasController],
  providers: [
    CobranzasService,
    CollectionRoutesRepository,
    CollectionVisitsRepository,
    PaymentAgreementsRepository,
    CollectionNotesRepository,
  ],
})
export class CobranzasModule {}
