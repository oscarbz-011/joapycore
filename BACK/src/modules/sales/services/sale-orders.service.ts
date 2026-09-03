import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MarkupType, Prisma, Product } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProductsRepository } from '../../inventory/repositories/products.repository';
import { AdjustOrderDto } from '../dto/adjust-order.dto';
import { CollectPaymentDto } from '../dto/collect-payment.dto';
import { CreateGuarantorDto } from '../dto/create-guarantor.dto';
import {
  CreateSaleOrderDto,
  SaleOrderItemDto,
} from '../dto/create-sale-order.dto';
import { RegisterDownPaymentDto } from '../dto/register-down-payment.dto';
import { RequestAdjustmentDto } from '../dto/request-adjustment.dto';
import { GuarantorsRepository } from '../repositories/guarantors.repository';
import { SaleOrdersRepository } from '../repositories/sale-orders.repository';
import { CreditEvaluationService } from './credit-evaluation.service';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

interface CreatedItemInfo {
  saleItemId: string;
  productId: string | null;
  quantity: number;
  warehouseId: string | null;
  isSerialized: boolean;
}

// Minimal shape needed to place an order from a "quick sale" flow (POS today,
// potentially other short-path channels later). Deliberately excludes
// customerId as required — walk-in sales resolve a default customer.
export interface QuickSaleDto {
  customerId?: string;
  items: SaleOrderItemDto[];
  payments: Array<{
    amount: number;
    paymentMethod: string;
    reference?: string;
  }>;
}

@Injectable()
export class SaleOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saleOrdersRepository: SaleOrdersRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly guarantorsRepository: GuarantorsRepository,
    private readonly creditEvaluationService: CreditEvaluationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string, sellerId?: string) {
    return this.saleOrdersRepository.findAll(tenantId, sellerId);
  }

  findPendingApprovals(tenantId: string) {
    return this.saleOrdersRepository.findPendingApprovals(tenantId);
  }

  async approveCredit(tenantId: string, id: string, userId?: string) {
    // Business rule checks before the atomic transition
    const order = await this.saleOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (order.status !== 'PENDING_CREDIT_APPROVAL') {
      throw new UnprocessableEntityException(
        'Solo los pedidos en espera de aprobación de crédito pueden aprobarse',
      );
    }

    // Check for overdue installments (morosidad)
    const overdueCount = await this.prisma.installment.count({
      where: {
        tenantId,
        status: 'OVERDUE',
        loan: { customerId: order.customerId },
      },
    });
    if (overdueCount > 0) {
      throw new UnprocessableEntityException(
        `El cliente tiene ${overdueCount} cuota(s) vencida(s). Regularice la situación antes de aprobar un nuevo crédito.`,
      );
    }

    // Check credit limit — cuenta saldo pendiente, no el monto original del
    // préstamo, para que uno ya casi pagado no siga ocupando el límite entero.
    const customer = await this.prisma.customer.findFirst({
      where: { id: order.customerId, tenantId },
      select: { creditLimit: true },
    });
    if (customer?.creditLimit) {
      const activeLoans = await this.prisma.loan.findMany({
        where: { tenantId, customerId: order.customerId, status: 'ACTIVE' },
        select: {
          totalAmount: true,
          installments: { select: { paidAmount: true } },
        },
      });
      const currentDebt = activeLoans.reduce((sum, loan) => {
        const paid = loan.installments.reduce(
          (s, i) => s + toNum(i.paidAmount),
          0,
        );
        return sum + Math.max(toNum(loan.totalAmount) - paid, 0);
      }, 0);
      const orderTotal = (
        order.items as Array<{ unitPrice: unknown; quantity: number }>
      ).reduce((sum, i) => sum + toNum(i.unitPrice) * i.quantity, 0);
      const limit = toNum(customer.creditLimit);
      if (currentDebt + orderTotal > limit) {
        throw new UnprocessableEntityException(
          `El cliente supera su límite de crédito (${limit}). Deuda activa: ${currentDebt}, pedido: ${orderTotal}.`,
        );
      }
    }

    // Check income-based capacity — misma fórmula que LoansService.createFromOrder()
    // para que la cuota estimada acá coincida exactamente con la que se va a
    // generar si se aprueba.
    const proposedMonthlyPayment = this.computeProposedMonthlyPayment(order);

    const capacity = await this.creditEvaluationService.evaluateIncomeCapacity(
      tenantId,
      order.customerId,
      proposedMonthlyPayment,
      this.guarantorIncomes(order),
    );
    if (capacity.applicable && capacity.exceeds) {
      throw new UnprocessableEntityException(
        `La cuota propuesta (${proposedMonthlyPayment}) supera la capacidad de pago del cliente según su sueldo. ` +
          `Disponible: ${capacity.available}, compromiso actual: ${capacity.currentCommitment}. ` +
          `Use "Necesita ajustes" para sugerir alternativas al vendedor.`,
      );
    }

    // Check external bureau — si está habilitado y hace falta una consulta
    // para este pedido/cliente, o si la última consulta registrada dio
    // reportado, no se puede aprobar todavía.
    const bureauStatus =
      await this.creditEvaluationService.getBureauCheckStatus(
        tenantId,
        order.customerId,
        id,
      );
    if (bureauStatus.required) {
      throw new UnprocessableEntityException(
        'Falta registrar la verificación de buró de crédito para este cliente antes de aprobar.',
      );
    }
    if (bureauStatus.latestResult === 'FLAGGED') {
      throw new UnprocessableEntityException(
        'El cliente figura reportado en el buró de crédito. No se puede aprobar este pedido.',
      );
    }

    // Atomic transition — TOCTOU-safe because status is the guard
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      data: {
        status: 'CREDIT_APPROVED',
        approvedById: userId ?? null,
        approvedAt: new Date(),
      },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'El pedido fue modificado por otra operación concurrente. Por favor, recargue e intente de nuevo.',
      );
    }

    // Triggers Loan + Installment creation in FinanceModule via event
    this.eventEmitter.emit('sale.credit.approved', {
      tenantId,
      saleOrderId: id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.credit.approved',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  async registerDownPayment(
    tenantId: string,
    id: string,
    dto: RegisterDownPaymentDto,
    userId?: string,
  ) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'CREDIT_APPROVED') {
      throw new UnprocessableEntityException(
        'Solo se puede registrar el pie (entrega inicial) en pedidos con crédito aprobado',
      );
    }

    const existing = await this.prisma.downPayment.findUnique({
      where: { saleOrderId: id },
    });
    if (existing) {
      throw new ConflictException(
        'Ya existe un pie registrado para este pedido',
      );
    }

    const downPayment = await this.prisma.downPayment.create({
      data: {
        tenantId,
        saleOrderId: id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paymentDate: new Date(dto.paymentDate),
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        registeredById: userId ?? null,
      },
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.down-payment.registered',
      resourceId: id,
      after: { downPaymentId: downPayment.id, amount: dto.amount },
    } satisfies AuditLogEvent);

    return downPayment;
  }

  async rejectCredit(
    tenantId: string,
    id: string,
    reason: string,
    userId?: string,
  ) {
    // Atomic transition: only succeeds if current status is PENDING_CREDIT_APPROVAL.
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      data: {
        status: 'CREDIT_REJECTED',
        rejectedById: userId ?? null,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos en espera de aprobación de crédito pueden rechazarse',
      );
    }
    this.eventEmitter.emit('sale.credit.rejected', {
      tenantId,
      saleOrderId: id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.credit.rejected',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.saleOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Sale order not found');
    return order;
  }

  // Agrega historial crediticio + capacidad de pago + estado de buró en una
  // sola respuesta para el panel del analista en "Aprobaciones de crédito".
  // Solo lectura — no repite los chequeos de bloqueo de approveCredit().
  async getCreditEvaluation(tenantId: string, id: string) {
    const order = await this.findOne(tenantId, id);
    const proposedMonthlyPayment = this.computeProposedMonthlyPayment(order);

    const [history, capacity, bureau] = await Promise.all([
      this.creditEvaluationService.getCustomerCreditHistory(
        tenantId,
        order.customerId,
      ),
      this.creditEvaluationService.evaluateIncomeCapacity(
        tenantId,
        order.customerId,
        proposedMonthlyPayment,
        this.guarantorIncomes(order),
      ),
      this.creditEvaluationService.getBureauCheckStatus(
        tenantId,
        order.customerId,
        id,
      ),
    ]);

    return { proposedMonthlyPayment, history, capacity, bureau };
  }

  async requestAdjustment(
    tenantId: string,
    id: string,
    dto: RequestAdjustmentDto,
    userId?: string,
  ) {
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING_CREDIT_APPROVAL' },
      data: {
        status: 'CREDIT_NEEDS_ADJUSTMENT',
        adjustmentNote: dto.note ?? null,
        suggestedAlternatives: dto.suggestedAlternatives,
      },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos en espera de aprobación de crédito pueden enviarse a ajustes',
      );
    }
    this.eventEmitter.emit('sale.credit.adjustment_requested', {
      tenantId,
      saleOrderId: id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.credit.adjustment_requested',
      resourceId: id,
      after: {
        suggestedAlternatives: dto.suggestedAlternatives,
        note: dto.note,
      },
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  // El vendedor agrega un garante en respuesta a la sugerencia del analista.
  // El pedido se queda en CREDIT_NEEDS_ADJUSTMENT — ya no reenvía solo: el
  // vendedor puede combinar esto con cambios de ítems/cuotas
  // (adjustOrder()) y recién reenviar de forma explícita con
  // resubmitForApproval() cuando termine. La nota del analista se conserva
  // (no se limpia) como referencia para la re-revisión.
  async addGuarantor(
    tenantId: string,
    id: string,
    dto: CreateGuarantorDto,
    userId?: string,
  ) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'CREDIT_NEEDS_ADJUSTMENT') {
      throw new UnprocessableEntityException(
        'Solo se pueden agregar garantes a pedidos que necesitan ajustes',
      );
    }

    const guarantor = await this.guarantorsRepository.create({
      tenantId,
      saleOrderId: id,
      firstName: dto.firstName,
      lastName: dto.lastName,
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      address: dto.address ?? null,
      monthlyIncome: dto.monthlyIncome ?? null,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.credit.guarantor_added',
      resourceId: id,
      after: { guarantorId: guarantor.id },
    } satisfies AuditLogEvent);

    return this.saleOrdersRepository.findById(tenantId, id);
  }

  // El vendedor cambia ítems y/o el plan de cuotas de un pedido que el
  // analista marcó como CREDIT_NEEDS_ADJUSTMENT. Reemplaza los ítems por
  // completo (no hay merge parcial) y recalcula financedUnitPrice/totales
  // igual que create() — a esta altura del flujo el pedido nunca fue
  // aprobado, así que no existe Loan (se crea recién en approve()) ni stock
  // reservado (create() solo reserva para ventas de contado), por lo que no
  // hay efectos secundarios en otros módulos que sincronizar. El estado no
  // cambia acá — reenviar a evaluación es una acción aparte, explícita
  // (resubmitForApproval()).
  async adjustOrder(
    tenantId: string,
    id: string,
    dto: AdjustOrderDto,
    userId?: string,
  ) {
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'CREDIT_NEEDS_ADJUSTMENT') {
      throw new UnprocessableEntityException(
        'Solo se pueden ajustar pedidos que necesitan ajustes',
      );
    }
    if (!dto.items && !dto.installments) {
      throw new UnprocessableEntityException('No hay cambios para aplicar');
    }

    const newInstallments = dto.installments ?? order.installments;
    let creditInterestRate = order.interestRate
      ? toNum(order.interestRate)
      : null;
    if (newInstallments && (dto.installments || dto.items)) {
      const plan = await this.prisma.creditPlan.findFirst({
        where: {
          creditConfig: { tenantId },
          installments: newInstallments,
          isActive: true,
        },
      });
      if (!plan) {
        throw new UnprocessableEntityException(
          `No hay un plan de crédito activo para ${newInstallments} cuotas. Configurá los planes en Ajustes → Créditos.`,
        );
      }
      creditInterestRate =
        typeof plan.interestRate === 'object'
          ? (plan.interestRate as { toNumber(): number }).toNumber()
          : Number(plan.interestRate);
    }

    let productMap = new Map<string, Product>();
    if (dto.items) {
      for (const item of dto.items) {
        if (!item.productId && !item.description) {
          throw new UnprocessableEntityException(
            'Los ítems sin producto deben tener una descripción',
          );
        }
      }
      const productIds = dto.items
        .map((i) => i.productId)
        .filter((pid): pid is string => !!pid);
      const products = await this.productsRepository.findManyByIds(
        tenantId,
        productIds,
      );
      productMap = new Map(products.map((p) => [p.id, p]));
    }

    const { subtotal, total } = this.computeTotals({
      items:
        dto.items ??
        order.items.map((i) => ({
          quantity: i.quantity,
          unitPrice: toNum(i.unitPrice),
        })),
      surchargeType: order.surchargeType,
      surchargeAmount: order.surchargeAmount
        ? toNum(order.surchargeAmount)
        : null,
    });

    await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        const oldItemIds = order.items.map((i) => i.id);
        await tx.productUnit.updateMany({
          where: { saleOrderItemId: { in: oldItemIds } },
          data: { saleOrderItemId: null },
        });
        await tx.saleOrderItem.deleteMany({
          where: { saleOrderId: id },
        });
        await this.createItemsWithSerials(
          tx,
          tenantId,
          id,
          dto.items,
          productMap,
          creditInterestRate,
        );
      } else if (dto.installments) {
        // Solo cambió el plan de cuotas — los ítems siguen siendo los
        // mismos, pero su financedUnitPrice quedó calculado con la tasa
        // vieja y hay que recalcularlo con la nueva.
        for (const item of order.items) {
          await tx.saleOrderItem.update({
            where: { id: item.id },
            data: {
              financedUnitPrice: creditInterestRate
                ? toNum(item.unitPrice) * (1 + creditInterestRate / 100)
                : undefined,
            },
          });
        }
      }

      await tx.saleOrder.update({
        where: { id },
        data: {
          installments: newInstallments,
          interestRate: creditInterestRate,
          subtotal,
          total,
        },
      });
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.adjusted',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.saleOrdersRepository.findById(tenantId, id);
  }

  // Acción explícita y separada de addGuarantor()/adjustOrder() — el
  // vendedor la dispara cuando terminó de hacer todos los cambios que
  // quería (ítems, cuotas, garantes) y recién ahí quiere que el analista
  // vuelva a evaluar el pedido.
  async resubmitForApproval(tenantId: string, id: string, userId?: string) {
    const result = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'CREDIT_NEEDS_ADJUSTMENT' },
      data: { status: 'PENDING_CREDIT_APPROVAL' },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo se pueden reenviar pedidos que necesitan ajustes',
      );
    }

    // Reentra a PENDING_CREDIT_APPROVAL — mismo evento que la solicitud
    // inicial de create()/convertQuoteToOrder(), el efecto sobre el badge
    // de "Evaluación de crédito" es idéntico.
    this.eventEmitter.emit('sale.credit.requested', {
      tenantId,
      saleOrderId: id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.credit.resubmitted',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.saleOrdersRepository.findById(tenantId, id);
  }

  // ── Shared helpers ──────────────────────────────────────────────────────────
  // Extracted from create()/deliver() so the "long path" (Sales: evaluate →
  // confirm → deliver, across separate requests) and "short path" (POS: one
  // atomic request) can share the same item/stock/serial mechanics without
  // duplicating them. A new short-path channel composes these the same way
  // createPosSale() does — it should never need a new branch inside create().

  private computeTotals(dto: {
    items: Array<{ quantity: number; unitPrice: number }>;
    surchargeType?: MarkupType | null;
    surchargeAmount?: number | null;
  }): { subtotal: number; total: number } {
    const subtotal = dto.items.reduce(
      (sum, i) => sum + i.quantity * i.unitPrice,
      0,
    );
    let total = subtotal;
    if (dto.surchargeAmount) {
      total =
        dto.surchargeType === 'FIXED'
          ? subtotal + dto.surchargeAmount
          : subtotal * (1 + dto.surchargeAmount / 100);
    }
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }

  // Misma fórmula que LoansService.createFromOrder() — duplicada a propósito
  // porque `sales` no puede importar del módulo `finance` (reglas de
  // arquitectura, ver CLAUDE.md). Si se toca una, tocar la otra.
  private computeProposedMonthlyPayment(order: {
    items: Array<{ unitPrice: unknown; quantity: number }>;
    surchargeAmount: unknown;
    surchargeType: string | null;
    interestRate: unknown;
    installments: number | null;
  }): number {
    const itemsTotal = order.items.reduce(
      (sum, i) => sum + toNum(i.unitPrice) * i.quantity,
      0,
    );
    const surcharge = order.surchargeAmount
      ? order.surchargeType === 'FIXED'
        ? toNum(order.surchargeAmount)
        : itemsTotal * (toNum(order.surchargeAmount) / 100)
      : 0;
    const principal = itemsTotal + surcharge;
    const interestRate = order.interestRate ? toNum(order.interestRate) : 0;
    const totalAmount = principal * (1 + interestRate / 100);
    return order.installments
      ? Math.round(totalAmount / order.installments)
      : totalAmount;
  }

  // Ingresos declarados de los garantes ya cargados en el pedido — un
  // garante amplía la línea de crédito disponible del cliente, así que la
  // capacidad de pago se evalúa sobre la suma de ambos sueldos.
  private guarantorIncomes(order: {
    guarantors: Array<{ monthlyIncome: unknown }>;
  }): number[] {
    return order.guarantors.map((g) =>
      g.monthlyIncome != null ? toNum(g.monthlyIncome) : 0,
    );
  }

  private async createItemsWithSerials(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
    items: SaleOrderItemDto[],
    productMap: Map<string, Product>,
    interestRate: number | null = null,
  ): Promise<CreatedItemInfo[]> {
    const created: CreatedItemInfo[] = [];

    for (const item of items) {
      const product = item.productId ? productMap.get(item.productId) : null;
      if (item.productId && !product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      if (product?.isSerialized) {
        const serials = item.serialNumbers ?? [];
        if (serials.length !== item.quantity) {
          throw new UnprocessableEntityException(
            `Product "${product.name}" is serialized — provide exactly ${item.quantity} serial number(s)`,
          );
        }
      }

      const saleItem = await tx.saleOrderItem.create({
        data: {
          saleOrderId: orderId,
          productId: item.productId ?? null,
          description: item.description ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          warehouseId: item.warehouseId ?? null,
          // Precio con interés ya aplicado — solo en ventas a crédito. Se
          // resuelve acá (no lo manda el cliente) para que facturación y el
          // contrato generado no tengan que recalcularlo ni confiar en el
          // precio contado.
          financedUnitPrice: interestRate
            ? item.unitPrice * (1 + interestRate / 100)
            : undefined,
          comboId: item.comboId ?? null,
          comboGroupId: item.comboGroupId ?? null,
          specNotes: item.specNotes ?? null,
        },
      });

      if (product?.isSerialized && (item.serialNumbers?.length ?? 0) > 0) {
        for (const serial of item.serialNumbers!) {
          const unit = await tx.productUnit.findFirst({
            where: {
              tenantId,
              productId: item.productId!,
              serialNumber: serial,
            },
          });
          if (!unit)
            throw new NotFoundException(`Serial number "${serial}" not found`);
          if (unit.status !== 'IN_STOCK') {
            throw new UnprocessableEntityException(
              `Serial "${serial}" is not available (status: ${unit.status})`,
            );
          }
          await tx.productUnit.update({
            where: { id: unit.id },
            data: { saleOrderItemId: saleItem.id },
          });
        }
      }

      created.push({
        saleItemId: saleItem.id,
        productId: item.productId ?? null,
        quantity: item.quantity,
        warehouseId: item.warehouseId ?? null,
        isSerialized: !!product?.isSerialized,
      });
    }

    return created;
  }

  // RESERVE = commit stock without releasing it yet (long path: create() reserves,
  //           deliver() later turns the reservation into a real OUT movement).
  // CONSUME = go straight to a real OUT movement (short path: nothing to reserve
  //           because the sale is created and handed over in the same step).
  private async applyStockMovements(
    tx: Prisma.TransactionClient,
    tenantId: string,
    items: Array<{
      saleItemId: string;
      productId: string | null;
      quantity: number;
      warehouseId: string | null;
    }>,
    mode: 'RESERVE' | 'CONSUME',
  ): Promise<void> {
    for (const item of items) {
      if (!item.productId) continue; // free-text / service lines never touch stock
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          warehouseId: item.warehouseId,
          type: mode === 'RESERVE' ? 'RESERVED' : 'OUT',
          quantity: -item.quantity,
          referenceId: item.saleItemId,
        },
      });
    }
  }

  private async markSerializedUnitsSold(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleItemId: string,
  ): Promise<void> {
    const units = await tx.productUnit.findMany({
      where: { saleOrderItemId: saleItemId, tenantId },
    });
    for (const unit of units) {
      await tx.productUnit.update({
        where: { id: unit.id },
        data: { status: 'SOLD' },
      });
    }
  }

  // Resuelve la sucursal de la venta a partir del usuario logueado. Si el
  // usuario no tiene branchId asignado (ej. el owner registrado, que hoy no
  // queda vinculado a la Casa Matriz automáticamente), cae a la sucursal
  // principal del tenant — así funciona sin fricción con una sola sucursal
  // y sin romper nada cuando se agregan más.
  // POST /sales/orders crea tanto pedidos reales como presupuestos — mismo
  // problema que documents.service.ts (una ruta, dos permisos distintos
  // según un campo del body) resuelto con el mismo patrón: sin decorador
  // estático en el controller, se decide acá.
  private assertCanCreateOrder(
    orderType: string | undefined,
    userPermissions: string[],
  ) {
    const required =
      orderType === 'QUOTE' ? 'sales:quotes:manage' : 'sales:create';
    if (!userPermissions.includes(required)) {
      throw new ForbiddenException(
        orderType === 'QUOTE'
          ? 'No tenés permiso para crear presupuestos'
          : 'No tenés permiso para crear pedidos',
      );
    }
  }

  private async generateQuoteNumber(tenantId: string): Promise<string> {
    const year = String(new Date().getFullYear()).slice(-2);
    const last = await this.saleOrdersRepository.findLastQuoteNumber(tenantId);
    if (!last?.quoteNumber) return `PRES-${year}-000001`;
    const match = last.quoteNumber.match(/^PRES-\d{2}-(\d+)$/);
    if (!match) return `PRES-${year}-000001`;
    const next = parseInt(match[1], 10) + 1;
    return `PRES-${year}-${String(next).padStart(6, '0')}`;
  }

  private async resolveBranchId(
    tenantId: string,
    userId?: string | null,
  ): Promise<string | null> {
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
      });
      if (user?.branchId) return user.branchId;
    }
    const mainBranch = await this.prisma.branch.findFirst({
      where: { tenantId, isMain: true },
      select: { id: true },
    });
    return mainBranch?.id ?? null;
  }

  private async resolveWalkInCustomerId(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const existing = await tx.customer.findFirst({
      where: { tenantId, firstName: 'Consumidor', lastName: 'Final' },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await tx.customer.create({
      data: { tenantId, firstName: 'Consumidor', lastName: 'Final' },
      select: { id: true },
    });
    return created.id;
  }

  // ── Long path: multi-step (evaluate → confirm → deliver, separate requests) ──

  async create(
    tenantId: string,
    dto: CreateSaleOrderDto,
    userId?: string,
    canManage = false,
    userPermissions: string[] = [],
  ) {
    this.assertCanCreateOrder(dto.orderType, userPermissions);

    const effectiveSellerId =
      canManage && dto.sellerId ? dto.sellerId : (userId ?? null);
    const isQuote = dto.orderType === 'QUOTE';
    const isCreditSale = dto.saleType === 'CREDIT';

    // Batch-fetch all products in a single query — avoids N+1 inside the loop.
    const productIds = dto.items
      .map((i) => i.productId)
      .filter((id): id is string => !!id);
    const products = await this.productsRepository.findManyByIds(
      tenantId,
      productIds,
    );
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate free-text items have a description
    for (const item of dto.items) {
      if (!item.productId && !item.description) {
        throw new UnprocessableEntityException(
          'Los ítems sin producto deben tener una descripción',
        );
      }
    }

    const { subtotal, total } = this.computeTotals(dto);

    // Quotes never block stock and don't need credit approval yet
    let initialStatus: 'QUOTED' | 'PENDING' | 'PENDING_CREDIT_APPROVAL';
    if (isQuote) {
      initialStatus = 'QUOTED';
    } else if (isCreditSale) {
      initialStatus = 'PENDING_CREDIT_APPROVAL';
    } else {
      initialStatus = 'PENDING';
    }

    // For credit sales, resolve the interest rate from the tenant's active CreditPlan
    // before opening the transaction to fail fast with a clear error.
    let creditInterestRate: number | null = null;
    if (isCreditSale) {
      if (!dto.installments) {
        throw new UnprocessableEntityException(
          'Las ventas a crédito requieren especificar el número de cuotas',
        );
      }
      const plan = await this.prisma.creditPlan.findFirst({
        where: {
          creditConfig: { tenantId },
          installments: dto.installments,
          isActive: true,
        },
      });
      if (!plan) {
        throw new UnprocessableEntityException(
          `No hay un plan de crédito activo para ${dto.installments} cuotas. Configurá los planes en Ajustes → Créditos.`,
        );
      }
      creditInterestRate =
        typeof plan.interestRate === 'object'
          ? (plan.interestRate as { toNumber(): number }).toNumber()
          : Number(plan.interestRate);
    }

    const branchId = await this.resolveBranchId(tenantId, userId);
    const quoteNumber = isQuote
      ? await this.generateQuoteNumber(tenantId)
      : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const order = await tx.saleOrder.create({
        data: {
          tenantId,
          customerId: dto.customerId,
          branchId,
          createdById: userId ?? null,
          sellerId: effectiveSellerId,
          orderType: dto.orderType ?? 'STANDARD',
          saleType: dto.saleType ?? 'CASH',
          installments: isCreditSale ? (dto.installments ?? null) : null,
          interestRate: creditInterestRate,
          orderDate: new Date(),
          notes: dto.notes,
          status: initialStatus,
          surchargeType: dto.surchargeType ?? null,
          surchargeAmount: dto.surchargeAmount ?? null,
          surchargeReason: dto.surchargeReason ?? null,
          quoteNumber,
          subtotal,
          total,
        },
      });

      const createdItems = await this.createItemsWithSerials(
        tx,
        tenantId,
        order.id,
        dto.items,
        productMap,
        creditInterestRate,
      );

      // For non-QUOTE cash orders, reserve stock immediately so it's visible as committed
      if (!isQuote && !isCreditSale) {
        await this.applyStockMovements(tx, tenantId, createdItems, 'RESERVE');
      }

      const fullOrder = await tx.saleOrder.findUnique({
        where: { id: order.id },
        include: { customer: true, items: { include: { product: true } } },
      });
      this.eventEmitter.emit('audit.log', {
        tenantId,
        userId,
        module: 'sales',
        action: 'sale.order.created',
        resourceId: order.id,
        after: fullOrder,
      } satisfies AuditLogEvent);
      return fullOrder;
    });

    if (isQuote && created) {
      this.eventEmitter.emit('sale.order.quoted', {
        tenantId,
        saleOrderId: created.id,
        issuedById: userId,
      });
    } else if (isCreditSale && created) {
      // Entra a PENDING_CREDIT_APPROVAL — el badge de "Evaluación de
      // crédito" en el sidebar depende de este evento para actualizarse
      // en vivo (ver front/lib/ws-event-map.ts).
      this.eventEmitter.emit('sale.credit.requested', {
        tenantId,
        saleOrderId: created.id,
      });
    }

    return created;
  }

  async convertQuoteToOrder(tenantId: string, id: string, userId?: string) {
    // Quotes become real orders: QUOTED → PENDING (cash) or PENDING_CREDIT_APPROVAL (credit)
    const order = await this.findOne(tenantId, id);
    if (order.status !== 'QUOTED') {
      throw new UnprocessableEntityException(
        'Solo los presupuestos en estado QUOTED pueden convertirse en pedido',
      );
    }
    const isCreditSale = order.saleType === 'CREDIT';
    const nextStatus = isCreditSale ? 'PENDING_CREDIT_APPROVAL' : 'PENDING';

    const updated = await this.prisma.saleOrder.update({
      where: { id },
      data: { status: nextStatus, orderType: 'STANDARD' },
    });
    if (isCreditSale) {
      this.eventEmitter.emit('sale.credit.requested', {
        tenantId,
        saleOrderId: id,
      });
    }
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.quote.converted',
      resourceId: id,
    } satisfies AuditLogEvent);
    return updated;
  }

  // Cash sales Phase 3: collect payment → PAYMENT_RECEIVED + invoice trigger
  async collectPayment(
    tenantId: string,
    id: string,
    dto: CollectPaymentDto,
    userId?: string,
  ) {
    const transitioned = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: 'PENDING', saleType: 'CASH' },
      data: { status: 'PAYMENT_RECEIVED' },
    });
    if (transitioned.count === 0) {
      throw new UnprocessableEntityException(
        'Solo pedidos contado en estado PENDIENTE pueden registrar cobro',
      );
    }

    await this.prisma.salePayment.createMany({
      data: dto.payments.map((p) => ({
        tenantId,
        saleOrderId: id,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        paymentDate: new Date(p.paymentDate),
        reference: p.reference ?? null,
        notes: p.notes ?? null,
        collectedById: userId ?? null,
      })),
    });

    const order = await this.saleOrdersRepository.findById(tenantId, id);
    // Triggers invoice creation in billing module for cash sales
    this.eventEmitter.emit('sale.payment.collected', {
      tenantId,
      saleOrderId: id,
      order,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.payment.collected',
      resourceId: id,
      after: { payments: dto.payments },
    } satisfies AuditLogEvent);
    return order;
  }

  // Both cash (PENDING) and credit (CREDIT_APPROVED) → CONFIRMED.
  // sale.order.completed triggers billing to create the invoice for both flows.
  async confirm(tenantId: string, id: string, userId?: string) {
    const transitioned = await this.prisma.saleOrder.updateMany({
      where: { id, tenantId, status: { in: ['PENDING', 'CREDIT_APPROVED'] } },
      data: { status: 'CONFIRMED' },
    });
    if (transitioned.count === 0) {
      throw new UnprocessableEntityException(
        'El pedido no puede confirmarse en su estado actual',
      );
    }

    const confirmed = await this.saleOrdersRepository.findById(tenantId, id);

    // Create delivery note in PENDING state so logistics can pick it up.
    // Upsert guards against re-confirming an order that already has a note.
    const deliveryNote = await this.prisma.deliveryNote.upsert({
      where: { saleOrderId: id },
      create: {
        tenantId,
        saleOrderId: id,
        status: 'PENDING',
        issuedAt: new Date(),
      },
      update: {},
    });
    // Solo la primera confirmación crea la nota — un upsert repetido (re-confirmar
    // un pedido que ya tenía nota) no debe reabrir el badge de "pendiente de
    // despacho" en logística si esa nota ya avanzó de estado.
    if (deliveryNote.status === 'PENDING') {
      this.eventEmitter.emit('delivery.note.created', {
        tenantId,
        saleOrderId: id,
        deliveryNoteId: deliveryNote.id,
      });
    }

    // Invoice is created by BillingOnSaleListener on this event
    this.eventEmitter.emit('sale.order.completed', {
      tenantId,
      saleOrderId: id,
      order: confirmed,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.confirmed',
      resourceId: id,
    } satisfies AuditLogEvent);
    return confirmed;
  }

  // Bloque de stock-out compartido por handleDeliveryConfirmed() (logística
  // marca la entrega) y deliver() (ruta directa de ventas) — antes estaba
  // duplicado casi al carácter entre ambos métodos. Sales sigue sin saber
  // nada de lotes/ProductBatch: el consumo FIFO es responsabilidad exclusiva
  // de inventory, disparado por el evento `sale.order.stock_out` que emiten
  // ambos call sites después de que esta transacción confirma.
  private async applyDeliveryStockOut(
    tx: Prisma.TransactionClient,
    tenantId: string,
    order: Awaited<ReturnType<SaleOrdersService['findOne']>>,
    isCashOrder: boolean,
  ) {
    for (const item of order.items) {
      if (!item.productId) continue; // free-text / service lines have no stock

      if (isCashOrder) {
        // Cash only: release the RESERVED movement created at order creation
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: item.warehouseId ?? null,
            type: 'RESERVED',
            quantity: item.quantity, // positive = reverses the reservation
            referenceId: item.id,
          },
        });
      }

      // All orders (cash + credit): create the real OUT movement
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          warehouseId: item.warehouseId ?? null,
          type: 'OUT',
          quantity: -item.quantity,
          referenceId: item.id,
        },
      });

      // All orders: mark serialized units as SOLD
      if (item.product?.isSerialized) {
        await this.markSerializedUnitsSold(tx, tenantId, item.id);
      }
    }
  }

  // Called by SalesOnDeliveryListener when logistics confirms delivery
  async handleDeliveryConfirmed(
    tenantId: string,
    saleOrderId: string,
    userId?: string,
  ) {
    await this.prisma.saleOrder.updateMany({
      where: {
        id: saleOrderId,
        tenantId,
        status: { in: ['CONFIRMED', 'INVOICED', 'PAYMENT_RECEIVED'] },
      },
      data: { status: 'DELIVERED' },
    });

    const order = await this.findOne(tenantId, saleOrderId);
    const isCashOrder = order.saleType === 'CASH';

    await this.prisma.$transaction((tx) =>
      this.applyDeliveryStockOut(tx, tenantId, order, isCashOrder),
    );
    this.eventEmitter.emit('sale.order.stock_out', { tenantId, saleOrderId });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.delivered',
      resourceId: saleOrderId,
    } satisfies AuditLogEvent);
  }

  async deliver(tenantId: string, id: string, userId?: string) {
    const result = await this.prisma.saleOrder.updateMany({
      where: {
        id,
        tenantId,
        status: { in: ['CONFIRMED', 'PAYMENT_RECEIVED'] },
      },
      data: { status: 'DELIVERED' },
    });
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos confirmados pueden marcarse como entregados',
      );
    }

    const order = await this.findOne(tenantId, id);
    const isCashOrder = order.saleType === 'CASH';

    await this.prisma.$transaction((tx) =>
      this.applyDeliveryStockOut(tx, tenantId, order, isCashOrder),
    );
    this.eventEmitter.emit('sale.order.stock_out', {
      tenantId,
      saleOrderId: id,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.delivered',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  async cancel(tenantId: string, id: string, userId?: string) {
    const order = await this.findOne(tenantId, id);
    if (['CONFIRMED', 'PAYMENT_RECEIVED', 'DELIVERED'].includes(order.status)) {
      throw new UnprocessableEntityException(
        'Los pedidos confirmados o entregados no pueden cancelarse. Emitir una nota de crédito.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.saleOrder.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // Release stock reservations for cancelled cash orders
      if (order.saleType === 'CASH' && order.status === 'PENDING') {
        for (const item of order.items) {
          if (!item.productId) continue;
          await tx.stockMovement.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId: item.warehouseId ?? null,
              type: 'RESERVED',
              quantity: item.quantity, // positive = reverses the reservation
              referenceId: item.id,
            },
          });
        }
      }
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.cancelled',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.saleOrdersRepository.findById(tenantId, id);
  }

  // ── Short path: POS (single atomic request — no credit, no delivery note) ────

  // channel=POS always saleType=CASH by product decision — the DTO doesn't even
  // expose saleType/installments, so there is nothing to branch on here.
  async createPosSale(
    tenantId: string,
    dto: QuickSaleDto,
    posSessionId: string,
    userId: string,
  ) {
    for (const item of dto.items) {
      if (!item.productId && !item.description) {
        throw new UnprocessableEntityException(
          'Los ítems sin producto deben tener una descripción',
        );
      }
    }

    const productIds = dto.items
      .map((i) => i.productId)
      .filter((id): id is string => !!id);
    const products = await this.productsRepository.findManyByIds(
      tenantId,
      productIds,
    );
    const productMap = new Map(products.map((p) => [p.id, p]));

    const { subtotal, total } = this.computeTotals(dto);
    const branchId = await this.resolveBranchId(tenantId, userId);

    const order = await this.prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction: the session could have been closed
      // by a concurrent request between the controller call and this point.
      const session = await tx.posSession.findFirst({
        where: { id: posSessionId, tenantId, status: 'OPEN' },
      });
      if (!session) {
        throw new UnprocessableEntityException(
          'La sesión de caja no está abierta',
        );
      }

      const customerId =
        dto.customerId ?? (await this.resolveWalkInCustomerId(tx, tenantId));

      const created = await tx.saleOrder.create({
        data: {
          tenantId,
          customerId,
          branchId,
          createdById: userId,
          sellerId: userId,
          orderType: 'STANDARD',
          saleType: 'CASH',
          channel: 'POS',
          posSessionId,
          orderDate: new Date(),
          status: 'PENDING',
          subtotal,
          total,
        },
      });

      const createdItems = await this.createItemsWithSerials(
        tx,
        tenantId,
        created.id,
        dto.items,
        productMap,
      );

      // No RESERVED step — the sale is handed over at the counter in this
      // same transaction, so it goes straight to a real OUT movement.
      await this.applyStockMovements(tx, tenantId, createdItems, 'CONSUME');
      for (const item of createdItems) {
        if (item.isSerialized) {
          await this.markSerializedUnitsSold(tx, tenantId, item.saleItemId);
        }
      }

      await tx.salePayment.createMany({
        data: dto.payments.map((p) => ({
          tenantId,
          saleOrderId: created.id,
          amount: p.amount,
          paymentMethod: p.paymentMethod as never,
          paymentDate: new Date(),
          reference: p.reference ?? null,
          collectedById: userId,
          posSessionId,
        })),
      });

      // No DeliveryNote: the counter hands the goods over immediately, there's
      // no separate logistics dispatch step to track.
      await tx.saleOrder.update({
        where: { id: created.id },
        data: { status: 'DELIVERED' },
      });

      return tx.saleOrder.findUniqueOrThrow({
        where: { id: created.id },
        include: { customer: true, items: { include: { product: true } } },
      });
    });

    // Reuses BillingOnSaleListener as-is — it's already channel-agnostic and
    // idempotent per saleOrderId, so no changes needed in billing.
    this.eventEmitter.emit('sale.payment.collected', {
      tenantId,
      saleOrderId: order.id,
      order,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.created',
      resourceId: order.id,
      after: order,
    } satisfies AuditLogEvent);

    return order;
  }
}
