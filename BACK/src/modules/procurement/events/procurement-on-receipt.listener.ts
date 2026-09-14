import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PurchaseReceiptsRepository } from '../repositories/purchase-receipts.repository';
import { AccountsPayableRepository } from '../repositories/accounts-payable.repository';

interface PurchaseReceiptCreatedEvent {
  tenantId: string;
  purchaseOrderId: string;
  purchaseReceiptId: string;
  warehouseId?: string;
}

const DAY_MS = 86_400_000;

// Genera la Cuenta por Pagar al recibir mercadería — vive dentro del propio
// módulo procurement (el evento ya se emite acá, no hace falta cruzar a
// otro módulo como sí hace payments con billing/invoice.issued).
@Injectable()
export class ProcurementOnReceiptListener {
  private readonly logger = new Logger(ProcurementOnReceiptListener.name);

  constructor(
    private readonly purchaseReceiptsRepository: PurchaseReceiptsRepository,
    private readonly apRepository: AccountsPayableRepository,
  ) {}

  @OnEvent('purchase.receipt.created')
  async handle(event: PurchaseReceiptCreatedEvent) {
    try {
      await this.process(event);
    } catch (error) {
      this.logger.error(
        `No se pudo generar la cuenta por pagar de la recepción ${event.purchaseReceiptId}: ${(error as Error).message}`,
      );
    }
  }

  private async process(event: PurchaseReceiptCreatedEvent) {
    const { tenantId, purchaseReceiptId } = event;

    // Idempotencia: si el evento se repite, no duplicar la cuenta —
    // purchaseReceiptId es @unique en AccountsPayable.
    const existing = await this.apRepository.findByPurchaseReceipt(
      tenantId,
      purchaseReceiptId,
    );
    if (existing) return;

    const receipt = await this.purchaseReceiptsRepository.findForPayable(
      tenantId,
      purchaseReceiptId,
    );
    if (!receipt) return;

    const amount = receipt.items.reduce(
      (sum, item) => sum + item.quantity * Number(item.unitCost),
      0,
    );
    const termDays = receipt.purchaseOrder.supplier.paymentTermDays ?? 0;
    const dueDate = new Date(receipt.receivedAt.getTime() + termDays * DAY_MS);

    await this.apRepository.create({
      tenantId,
      purchaseReceiptId,
      supplierId: receipt.purchaseOrder.supplierId,
      amount,
      dueDate,
    });
  }
}
