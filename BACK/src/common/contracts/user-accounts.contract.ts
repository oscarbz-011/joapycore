import type { Prisma } from '@prisma/client';

/**
 * Cuentas de usuario para módulos que no son la plataforma (RRHH las crea al
 * dar de alta un empleado). Lo implementa `users/`; las operaciones que
 * reciben `tx` corren dentro de la transacción de quien llama.
 */
export const USER_ACCOUNTS = Symbol('USER_ACCOUNTS');

export interface NewUserAccount {
  email: string;
  firstName: string;
  lastName: string;
  branchId?: string | null;
  roleId?: string | null;
}

export interface UserAccounts {
  /** Crea la cuenta con una clave temporal. Rechaza un correo ya usado. */
  createWithTempPassword(
    tx: Prisma.TransactionClient,
    tenantId: string,
    account: NewUserAccount,
  ): Promise<{ userId: string; tempPassword: string }>;
  /** Nueva clave temporal; cierra las sesiones abiertas. */
  resetTempPassword(
    tenantId: string,
    userId: string,
  ): Promise<{ tempPassword: string }>;
  /** Desactiva la cuenta y cierra sus sesiones. */
  deactivate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ): Promise<void>;
  setBranch(
    tenantId: string,
    userId: string,
    branchId: string | null,
  ): Promise<void>;
  findByEmail(email: string): Promise<{ id: string; tenantId: string } | null>;
}
