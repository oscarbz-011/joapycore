import { Global, Module } from '@nestjs/common';
import { USER_ACCOUNTS } from '../common/contracts/user-accounts.contract';
import { UsersRepository } from './repositories/users.repository';
import { UserAccountsService } from './services/user-accounts.service';

/** Lo que la plataforma ofrece de las cuentas de usuario a los módulos. */
@Global()
@Module({
  providers: [
    UsersRepository,
    UserAccountsService,
    { provide: USER_ACCOUNTS, useExisting: UserAccountsService },
  ],
  exports: [USER_ACCOUNTS],
})
export class UsersContractsModule {}
