import { Module } from '@nestjs/common';
import { BranchesController } from './controllers/branches.controller';
import { BranchesRepository } from './repositories/branches.repository';
import { BranchesService } from './services/branches.service';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService, BranchesRepository],
  exports: [BranchesService],
})
export class BranchesModule {}
