import { Global, Module } from '@nestjs/common';
import { BRANCH_SETUP } from '../../common/contracts/branch-setup.contract';
import { BranchesRepository } from './repositories/branches.repository';

/** Lo que Sucursales ofrece a la plataforma y a otros módulos por contrato. */
@Global()
@Module({
  providers: [
    BranchesRepository,
    { provide: BRANCH_SETUP, useExisting: BranchesRepository },
  ],
  exports: [BRANCH_SETUP],
})
export class BranchesContractsModule {}
