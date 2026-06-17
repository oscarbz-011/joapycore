import { Module } from '@nestjs/common';
import { RolesController } from './controllers/roles.controller';
import { UsersController } from './controllers/users.controller';
import { RolesRepository } from './repositories/roles.repository';
import { UsersRepository } from './repositories/users.repository';
import { RolesService } from './services/roles.service';
import { UsersService } from './services/users.service';

@Module({
  controllers: [UsersController, RolesController],
  providers: [UsersRepository, RolesRepository, UsersService, RolesService],
  exports: [UsersRepository, RolesRepository, UsersService, RolesService],
})
export class UsersModule {}
