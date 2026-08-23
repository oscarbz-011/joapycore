import { CreditBureauCheckResult } from '@prisma/client';

export interface CreditBureauCheckInput {
  fullName: string;
  documentNumber: string;
}

export interface CreditBureauCheckOutput {
  result: CreditBureauCheckResult;
  notes?: string;
}

// Contrato para un proveedor de consulta de buró (Equifax u otro). Hoy solo
// existe ManualCreditBureauProvider — el analista carga el resultado a mano
// y CreditBureauChecksService.recordCheck() lo persiste directo, sin pasar
// por checkCustomer(). Cuando se integre una API real, el nuevo provider
// implementa esta interfaz y se resuelve por CreditBureauConfig.providerName
// (mismo patrón de registry que StorageDriver en el módulo Files) sin tocar
// el resto del flujo de aprobación de crédito.
export interface CreditBureauProvider {
  readonly name: string;
  checkCustomer(
    input: CreditBureauCheckInput,
  ): Promise<CreditBureauCheckOutput>;
}

export class ManualCreditBureauProvider implements CreditBureauProvider {
  readonly name = 'manual';

  checkCustomer(): Promise<CreditBureauCheckOutput> {
    throw new Error(
      'El proveedor "manual" no realiza consultas automáticas — el resultado se carga a mano vía recordCheck().',
    );
  }
}
