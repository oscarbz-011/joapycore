import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MarkupType, Prisma, Product, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdjustOrderDto } from '../dto/adjust-order.dto';
import { CollectPaymentDto } from '../dto/collect-payment.dto';
import { CreateGuarantorDto } from '../dto/create-guarantor.dto';
import {
  CreateSaleOrderDto,
  SaleOrderItemDto,
} from '../dto/create-sale-order.dto';
import { RegisterDownPaymentDto } from '../dto/register-down-payment.dto';
import { RequestAdjustmentDto } from '../dto/request-adjustment.dto';
import { CreditSourcesRepository } from '../repositories/credit-sources.repository';
import { CustomersRepository } from '../repositories/customers.repository';
import { GuarantorsRepository } from '../repositories/guarantors.repository';
import { SaleOrdersRepository } from '../repositories/sale-orders.repository';
import { SalesSourcesRepository } from '../repositories/sales-sources.repository';
import { CreditEvaluationService } from './credit-evaluation.service';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { OutboxService } from '../../../outbox/outbox.service';
import {
  PRODUCT_CATALOG,
  type ProductCatalog,
} from '../../../common/contracts/product-catalog.contract';
import type {
  QuickSaleInput,
  SalesGateway,
} from '../../../common/contracts/sales-gateway.contract';
import {
  STOCK_LEDGER,
  type StockLedger,
  type StockLine,
} from '../../../common/contracts/stock-ledger.contract';

const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: 'borrador',
  ACTIVE: 'activo',
  INACTIVE: 'descontinuado',
  BLOCKED: 'bloqueado',
};

function toNum(value: unknown): number {
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

type CreatedItemInfo = StockLine;

// Venta rápida (POS): el shape vive en common/contracts como QuickSaleInput.
export type QuickSaleDto = QuickSaleInput;

@Injectable()
export class SaleOrdersService implements SalesGateway {
  constructor(
    // Solo para abrir transacciones; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly saleOrdersRepository: SaleOrdersRepository,
    // Inventario por contrato (common/contracts): Ventas no importa
    // InventoryModule ni escribe stock_movements/product_units directamente.
    @Inject(PRODUCT_CATALOG) private readonly productCatalog: ProductCatalog,
    private readonly guarantorsRepository: GuarantorsRepository,
    private readonly creditEvaluationService: CreditEvaluationService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(STOCK_LEDGER) private readonly stockLedger: StockLedger,
    // Eventos críticos (préstamo, factura, nota de entrega) con entrega
    // garantizada: se guardan en la misma transacción que el cambio.
    private readonly outbox: OutboxService,
    private readonly creditSources: CreditSourcesRepository,
    private readonly salesSources: SalesSourcesRepository,
    private readonly customersRepository: CustomersRepository,
  ) {}

  /**
   * Qué órdenes puede leer el usuario: todas (sales:read), solo presupuestos
   * (sales:quotes:read) o ninguna.
   */
  readScope(permissions: string[]): 'ALL' | 'QUOTES' {
    if (permissions.includes('sales:read')) return 'ALL';
    if (permissions.includes('sales:quotes:read')) return 'QUOTES';
    throw new ForbiddenException('Insufficient permissions');
  }

  findAll(
    tenantId: string,
    sellerId?: string,
    scope: 'ALL' | 'QUOTES' = 'ALL',
  ) {
    return this.saleOrdersRepository.findAll(
      tenantId,
      sellerId,
      scope === 'QUOTES' ? 'QUOTE' : undefined,
    );
  }

  async findOneForReader(
    tenantId: string,
    id: string,
    scope: 'ALL' | 'QUOTES',
  ) {
    const order = await this.findOne(tenantId, id);
    // Sin sales:read, una orden que no es presupuesto se trata como inexistente.
    if (scope === 'QUOTES' && order.orderType !== 'QUOTE') {
      throw new NotFoundException('Pedido no encontrado');
    }
    return order;
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
    const overdueCount = await this.creditSources.countOverdueInstallments(
      tenantId,
      order.customerId,
    );
    if (overdueCount > 0) {
      throw new UnprocessableEntityException(
        `El cliente tiene ${overdueCount} cuota(s) vencida(s). Regularice la situación antes de aprobar un nuevo crédito.`,
      );
    }

    // Check credit limit — cuenta saldo pendiente, no el monto original del
    // préstamo, para que uno ya casi pagado no siga ocupando el límite entero.
    const customer = await this.creditSources.findCustomerCreditLimit(
      tenantId,
      order.customerId,
    );
    if (customer?.creditLimit) {
      const activeLoans = await this.creditSources.findActiveLoanBalances(
        tenantId,
        order.customerId,
      );
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
    const creditApprovedEvent = await this.prisma.$transaction(async (tx) => {
      const result = await this.saleOrdersRepository.transition(
        tenantId,
        id,
        { status: 'PENDING_CREDIT_APPROVAL' },
        {
          status: 'CREDIT_APPROVED',
          approvedById: userId ?? null,
          approvedAt: new Date(),
        },
        tx,
      );
      if (result.count === 0) {
        throw new UnprocessableEntityException(
          'El pedido fue modificado por otra operación concurrente. Por favor, recargue e intente de nuevo.',
        );
      }
      // El stock pudo cambiar mientras el crédito estuvo en evaluación. La
      // aprobación es el momento en que se compromete definitivamente: se
      // valida y reserva dentro de la misma transacción que cambia el estado.
      await this.reserveMissingOrderStock(tx, tenantId, id);
      // Triggers Loan + Installment creation in FinanceModule
      return this.outbox.enqueue(tx, tenantId, 'sale.credit.approved', {
        tenantId,
        saleOrderId: id,
      });
    });
    await this.outbox.dispatch(creditApprovedEvent);
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

    const existing = await this.saleOrdersRepository.findDownPayment(id);
    if (existing) {
      throw new ConflictException(
        'Ya existe un pie registrado para este pedido',
      );
    }

    const downPayment = await this.saleOrdersRepository.createDownPayment({
      tenantId,
      saleOrderId: id,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      paymentDate: new Date(dto.paymentDate),
      reference: dto.reference ?? null,
      notes: dto.notes ?? null,
      registeredById: userId ?? null,
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
    const result = await this.saleOrdersRepository.transition(
      tenantId,
      id,
      { status: 'PENDING_CREDIT_APPROVAL' },
      {
        status: 'CREDIT_REJECTED',
        rejectedById: userId ?? null,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    );
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
    const result = await this.saleOrdersRepository.transition(
      tenantId,
      id,
      { status: 'PENDING_CREDIT_APPROVAL' },
      {
        status: 'CREDIT_NEEDS_ADJUSTMENT',
        adjustmentNote: dto.note ?? null,
        suggestedAlternatives: dto.suggestedAlternatives,
      },
    );
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
      const plan = await this.creditSources.findActivePlan(
        tenantId,
        newInstallments,
      );
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
      const products = await this.productCatalog.findManyByIds(
        tenantId,
        productIds,
      );
      this.assertSellable(products);
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
        await this.stockLedger.detachSerialUnits(tx, oldItemIds);
        await this.saleOrdersRepository.deleteItems(id, tx);
        const createdItems = await this.createItemsWithSerials(
          tx,
          tenantId,
          id,
          dto.items,
          productMap,
          creditInterestRate,
        );
        await this.assertItemsInStock(tx, tenantId, createdItems, productMap);
      } else if (dto.installments) {
        // Solo cambió el plan de cuotas — los ítems siguen siendo los
        // mismos, pero su financedUnitPrice quedó calculado con la tasa
        // vieja y hay que recalcularlo con la nueva.
        for (const item of order.items) {
          await this.saleOrdersRepository.updateItem(
            item.id,
            {
              financedUnitPrice: creditInterestRate
                ? toNum(item.unitPrice) * (1 + creditInterestRate / 100)
                : undefined,
            },
            tx,
          );
        }
      }

      await this.saleOrdersRepository.updateById(
        id,
        {
          installments: newInstallments,
          interestRate: creditInterestRate,
          subtotal,
          total,
        },
        tx,
      );
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
    const result = await this.saleOrdersRepository.transition(
      tenantId,
      id,
      { status: 'CREDIT_NEEDS_ADJUSTMENT' },
      { status: 'PENDING_CREDIT_APPROVAL' },
    );
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

  // Solo se vende lo que está ACTIVE. DRAFT = ficha incompleta (sin precio o
  // sin categoría), INACTIVE = descontinuado, BLOCKED = restringido por
  // calidad/auditoría — ninguno de los tres puede entrar en una venta nueva,
  // pero los tres siguen existiendo en el historial de ventas viejas (por eso
  // se valida acá, sobre los ítems entrantes, y no filtrando el catálogo).
  private assertSellable(products: Product[]) {
    // Además del estado, no todo producto se vende: una materia prima
    // (RAW_MATERIAL, ej. la madera de una carpintería) entra por compra y sale
    // por producción, nunca por el mostrador. El flag es editable por producto
    // para los casos mixtos — ver ProductKind / KIND_DEFAULT_FLAGS.
    const notForSale = products.filter((p) => !p.isSellable);
    if (notForSale.length) {
      const detail = notForSale.map((p) => p.name).join(', ');
      throw new UnprocessableEntityException(
        `Este producto no se vende, es de uso interno: ${detail}`,
      );
    }

    const notSellable = products.filter(
      (p) => p.status !== ProductStatus.ACTIVE,
    );
    if (notSellable.length) {
      const detail = notSellable
        .map((p) => `${p.name} (${PRODUCT_STATUS_LABEL[p.status]})`)
        .join(', ');
      throw new UnprocessableEntityException(
        `No se puede vender un producto que no está activo: ${detail}`,
      );
    }
  }

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

      const saleItem = await this.saleOrdersRepository.createItem(
        {
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
        tx,
      );

      if (product?.isSerialized && (item.serialNumbers?.length ?? 0) > 0) {
        await this.stockLedger.assignSerialUnits(
          tx,
          tenantId,
          item.productId!,
          item.serialNumbers!,
          saleItem.id,
        );
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

  // Los serializados se controlan por unidad (IN_STOCK) al asignar números de
  // serie; acá solo se valida la cantidad de los no serializados.
  private async assertItemsInStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    items: Array<
      Pick<CreatedItemInfo, 'productId' | 'quantity' | 'isSerialized'>
    >,
    productMap: Map<string, Pick<Product, 'name'>>,
  ): Promise<void> {
    await this.stockLedger.assertAvailable(
      tx,
      tenantId,
      items
        .filter((i) => i.productId && !i.isSerialized)
        .map((i) => ({
          productId: i.productId!,
          quantity: i.quantity,
          name: productMap.get(i.productId!)?.name,
        })),
    );
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
      const branchId = await this.salesSources.findUserBranchId(
        tenantId,
        userId,
      );
      if (branchId) return branchId;
    }
    return this.salesSources.findMainBranchId(tenantId);
  }

  private async resolveWalkInCustomerId(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    return this.customersRepository.findOrCreateWalkIn(tenantId, tx);
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
    const products = await this.productCatalog.findManyByIds(
      tenantId,
      productIds,
    );
    this.assertSellable(products);
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
      const plan = await this.creditSources.findActivePlan(
        tenantId,
        dto.installments,
      );
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
      const order = await this.saleOrdersRepository.createBare(
        {
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
        tx,
      );

      const createdItems = await this.createItemsWithSerials(
        tx,
        tenantId,
        order.id,
        dto.items,
        productMap,
        creditInterestRate,
      );

      // Ningún pedido real puede nacer sin stock. En contado además se reserva
      // inmediatamente; en crédito se vuelve a validar y se reserva recién al
      // aprobar, para no inmovilizar inventario durante una evaluación que
      // puede ser rechazada.
      if (!isQuote) {
        await this.assertItemsInStock(tx, tenantId, createdItems, productMap);
        if (!isCreditSale) {
          await this.stockLedger.reserve(tx, tenantId, createdItems);
        }
      }

      const fullOrder = await this.saleOrdersRepository.findWithItems(
        order.id,
        tx,
      );
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

    const updated = await this.saleOrdersRepository.updateById(id, {
      status: nextStatus,
      orderType: 'STANDARD',
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
    const paymentCollectedEvent = await this.prisma.$transaction(async (tx) => {
      const transitioned = await this.saleOrdersRepository.transition(
        tenantId,
        id,
        { status: 'PENDING', saleType: 'CASH' },
        { status: 'PAYMENT_RECEIVED' },
        tx,
      );
      if (transitioned.count === 0) {
        throw new UnprocessableEntityException(
          'Solo pedidos contado en estado PENDIENTE pueden registrar cobro',
        );
      }

      await this.saleOrdersRepository.createPayments(
        dto.payments.map((p) => ({
          tenantId,
          saleOrderId: id,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          paymentDate: new Date(p.paymentDate),
          reference: p.reference ?? null,
          notes: p.notes ?? null,
          collectedById: userId ?? null,
        })),
        tx,
      );

      // Triggers invoice creation in billing module for cash sales
      return this.outbox.enqueue(tx, tenantId, 'sale.payment.collected', {
        tenantId,
        saleOrderId: id,
      });
    });
    await this.outbox.dispatch(paymentCollectedEvent);

    const order = await this.saleOrdersRepository.findById(tenantId, id);
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
    const completedEvent = await this.prisma.$transaction(async (tx) => {
      const transitioned = await this.saleOrdersRepository.transition(
        tenantId,
        id,
        { status: { in: ['PENDING', 'CREDIT_APPROVED'] } },
        { status: 'CONFIRMED' },
        tx,
      );
      if (transitioned.count === 0) {
        throw new UnprocessableEntityException(
          'El pedido no puede confirmarse en su estado actual',
        );
      }

      // Defensa final: los pedidos contado ya están reservados y los de
      // crédito se reservan al aprobar. Si una orden antigua no tiene reserva,
      // se valida acá sin duplicar movimientos existentes.
      await this.reserveMissingOrderStock(tx, tenantId, id);

      // Invoice is created by BillingOnSaleListener and the delivery note by
      // LogisticsOnSaleCompletedListener on this event
      return this.outbox.enqueue(tx, tenantId, 'sale.order.completed', {
        tenantId,
        saleOrderId: id,
      });
    });
    await this.outbox.dispatch(completedEvent);

    const confirmed = await this.saleOrdersRepository.findById(tenantId, id);
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.confirmed',
      resourceId: id,
    } satisfies AuditLogEvent);
    return confirmed;
  }

  private async reserveMissingOrderStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
  ): Promise<void> {
    const items = await this.saleOrdersRepository.findProductItems(orderId, tx);
    const reserved = await this.stockLedger.findActiveReservations(
      tx,
      tenantId,
      items.map((i) => i.id),
    );
    const toReserve = items
      .filter((i) => !reserved.has(i.id))
      .map((i) => ({
        saleItemId: i.id,
        productId: i.productId,
        quantity: i.quantity,
        warehouseId: i.warehouseId ?? null,
        isSerialized: !!i.product?.isSerialized,
      }));

    await this.assertItemsInStock(
      tx,
      tenantId,
      toReserve,
      new Map(
        items.map((i) => [i.productId!, { name: i.product?.name ?? '' }]),
      ),
    );
    await this.stockLedger.reserve(tx, tenantId, toReserve);
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
  ) {
    // Libera la reserva vigente de cada ítem (contado: desde la creación;
    // crédito: desde la confirmación; pedidos viejos de crédito: ninguna).
    await this.stockLedger.releaseReservations(tx, tenantId, order.items);

    for (const item of order.items) {
      if (!item.productId) continue; // free-text / service lines have no stock

      // All orders (cash + credit): create the real OUT movement
      await this.stockLedger.consume(tx, tenantId, [
        {
          saleItemId: item.id,
          productId: item.productId,
          quantity: item.quantity,
          warehouseId: item.warehouseId ?? null,
          isSerialized: !!item.product?.isSerialized,
        },
      ]);

      // All orders: mark serialized units as SOLD
      if (item.product?.isSerialized) {
        await this.stockLedger.markSerialUnitsSold(tx, tenantId, item.id);
      }
    }
  }

  // Called by SalesOnDeliveryListener when logistics confirms delivery
  async handleDeliveryConfirmed(
    tenantId: string,
    saleOrderId: string,
    userId?: string,
  ) {
    await this.saleOrdersRepository.transition(
      tenantId,
      saleOrderId,
      { status: { in: ['CONFIRMED', 'INVOICED', 'PAYMENT_RECEIVED'] } },
      { status: 'DELIVERED' },
    );

    const order = await this.findOne(tenantId, saleOrderId);

    await this.prisma.$transaction((tx) =>
      this.applyDeliveryStockOut(tx, tenantId, order),
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
    const result = await this.saleOrdersRepository.transition(
      tenantId,
      id,
      { status: { in: ['CONFIRMED', 'PAYMENT_RECEIVED'] } },
      { status: 'DELIVERED' },
    );
    if (result.count === 0) {
      throw new UnprocessableEntityException(
        'Solo los pedidos confirmados pueden marcarse como entregados',
      );
    }

    const order = await this.findOne(tenantId, id);

    await this.prisma.$transaction((tx) =>
      this.applyDeliveryStockOut(tx, tenantId, order),
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
      await this.saleOrdersRepository.updateById(
        id,
        { status: 'CANCELLED' },
        tx,
      );

      // Release whatever is still reserved for this order
      await this.stockLedger.releaseReservations(tx, tenantId, order.items);
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
    const products = await this.productCatalog.findManyByIds(
      tenantId,
      productIds,
    );
    this.assertSellable(products);
    const productMap = new Map(products.map((p) => [p.id, p]));

    const { subtotal, total } = this.computeTotals(dto);
    const branchId = await this.resolveBranchId(tenantId, userId);

    const order = await this.prisma.$transaction(async (tx) => {
      // Re-checked inside the transaction: the session could have been closed
      // by a concurrent request between the controller call and this point.
      const session = await this.salesSources.findOpenPosSession(
        tenantId,
        posSessionId,
        tx,
      );
      if (!session) {
        throw new UnprocessableEntityException(
          'La sesión de caja no está abierta',
        );
      }

      const customerId =
        dto.customerId ?? (await this.resolveWalkInCustomerId(tx, tenantId));

      const created = await this.saleOrdersRepository.createBare(
        {
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
        tx,
      );

      const createdItems = await this.createItemsWithSerials(
        tx,
        tenantId,
        created.id,
        dto.items,
        productMap,
      );

      // No RESERVED step — the sale is handed over at the counter in this
      // same transaction, so it goes straight to a real OUT movement.
      await this.assertItemsInStock(tx, tenantId, createdItems, productMap);
      await this.stockLedger.consume(tx, tenantId, createdItems);
      for (const item of createdItems) {
        if (item.isSerialized) {
          await this.stockLedger.markSerialUnitsSold(
            tx,
            tenantId,
            item.saleItemId,
          );
        }
      }

      await this.saleOrdersRepository.createPayments(
        dto.payments.map((p) => ({
          tenantId,
          saleOrderId: created.id,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          paymentDate: new Date(),
          reference: p.reference ?? null,
          collectedById: userId,
          posSessionId,
        })),
        tx,
      );

      // No DeliveryNote: the counter hands the goods over immediately, there's
      // no separate logistics dispatch step to track.
      await this.saleOrdersRepository.updateById(
        created.id,
        { status: 'DELIVERED' },
        tx,
      );

      // Reuses BillingOnSaleListener — channel-agnostic and idempotent per
      // saleOrderId.
      const eventId = await this.outbox.enqueue(
        tx,
        tenantId,
        'sale.payment.collected',
        { tenantId, saleOrderId: created.id },
      );

      const saved = await this.saleOrdersRepository.findWithItemsOrThrow(
        created.id,
        tx,
      );
      return Object.assign(saved, { eventId });
    });

    const { eventId: paymentCollectedEvent, ...posOrder } = order;
    await this.outbox.dispatch(paymentCollectedEvent);
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'sale.order.created',
      resourceId: posOrder.id,
      after: posOrder,
    } satisfies AuditLogEvent);

    return posOrder;
  }
}
