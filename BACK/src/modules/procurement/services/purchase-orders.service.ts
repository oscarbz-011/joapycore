import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductStatus, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PrismaClientOrTx } from '../../../prisma/types';
import {
  PurchaseOrdersRepository,
  orderSequence,
} from '../repositories/purchase-orders.repository';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: 'borrador',
  ACTIVE: 'activo',
  INACTIVE: 'descontinuado',
  BLOCKED: 'bloqueado',
};

const MAX_NUMBER_ATTEMPTS = 3;

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  PENDING: 'en borrador',
  SENT: 'enviada',
  CONFIRMED: 'confirmada',
  PARTIALLY_RECEIVED: 'con recepción parcial',
  RECEIVED: 'recibida',
  CANCELLED: 'cancelada',
};

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseOrdersRepository: PurchaseOrdersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.purchaseOrdersRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.purchaseOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }

  async create(tenantId: string, userId: string, dto: CreatePurchaseOrderDto) {
    // Una ficha en DRAFT (incompleta), INACTIVE (descontinuada) o BLOCKED
    // (restringida) no se compra. La ficha se puede crear a medias para no
    // frenar la carga de catálogo, pero para operar tiene que estar completa
    // — ver ProductsService.missingToActivate.
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.purchaseOrdersRepository.findProductStatuses(
      tenantId,
      productIds,
    );
    // Un producto fabricado internamente (MANUFACTURED, ej. el mueble de una
    // carpintería) no se le compra a un proveedor: su stock entra por una
    // orden de producción. El flag es editable por producto para los casos
    // mixtos — ver ProductKind / KIND_DEFAULT_FLAGS.
    const notForPurchase = products.filter((p) => !p.isPurchasable);
    if (notForPurchase.length) {
      const detail = notForPurchase.map((p) => p.name).join(', ');
      throw new UnprocessableEntityException(
        `Este producto no se compra a proveedores, se fabrica: ${detail}`,
      );
    }

    const notPurchasable = products.filter(
      (p) => p.status !== ProductStatus.ACTIVE,
    );
    if (notPurchasable.length) {
      const detail = notPurchasable
        .map((p) => `${p.name} (${PRODUCT_STATUS_LABEL[p.status]})`)
        .join(', ');
      throw new UnprocessableEntityException(
        `No se puede comprar un producto que no está activo: ${detail}`,
      );
    }

    // Las líneas que salen del catálogo tienen que ser de este proveedor y
    // estar vinculadas al producto que se pide: el código y la descripción del
    // proveedor que van a la orden salen de ahí, no de lo que mande el cliente.
    const catalogIds = [
      ...new Set(dto.items.flatMap((i) => i.catalogItemId ?? [])),
    ];
    const catalogItems = catalogIds.length
      ? await this.purchaseOrdersRepository.findCatalogItems(
          tenantId,
          dto.supplierId,
          catalogIds,
        )
      : [];
    const catalogById = new Map(catalogItems.map((item) => [item.id, item]));
    for (const item of dto.items) {
      if (!item.catalogItemId) continue;
      const catalogItem = catalogById.get(item.catalogItemId);
      if (!catalogItem) {
        throw new UnprocessableEntityException(
          'Un ítem de la orden no pertenece al catálogo de este proveedor',
        );
      }
      if (catalogItem.productId !== item.productId) {
        throw new UnprocessableEntityException(
          `El ítem ${catalogItem.supplierSku} del catálogo no está vinculado a ese producto`,
        );
      }
    }

    const createOrder = () =>
      this.prisma.$transaction(async (tx) => {
        const order = await this.purchaseOrdersRepository.create(
          tenantId,
          {
            orderNumber: await this.nextOrderNumber(tenantId, tx),
            supplierId: dto.supplierId,
            purchaseType: dto.purchaseType,
            status: 'PENDING',
            orderDate: new Date(dto.orderDate),
            expectedDate: dto.expectedDate
              ? new Date(dto.expectedDate)
              : undefined,
            exchangeRate: dto.exchangeRate,
            customsDuty: dto.customsDuty,
            customsRef: dto.customsRef,
            notes: dto.notes,
          },
          tx,
        );

        for (const item of dto.items) {
          const catalogItem = item.catalogItemId
            ? catalogById.get(item.catalogItemId)
            : undefined;
          await this.purchaseOrdersRepository.createItem(
            {
              purchaseOrderId: order.id,
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              catalogItemId: catalogItem?.id ?? null,
              supplierSku: catalogItem?.supplierSku ?? null,
              supplierDescription: catalogItem?.description ?? null,
            },
            tx,
          );
        }

        await this.purchaseOrdersRepository.recordStatusChange(
          {
            tenantId,
            purchaseOrderId: order.id,
            fromStatus: null,
            toStatus: 'PENDING',
            changedById: userId,
          },
          tx,
        );

        this.eventEmitter.emit('audit.log', {
          tenantId,
          userId,
          module: 'procurement',
          action: 'purchase.order.created',
          resourceId: order.id,
        } satisfies AuditLogEvent);
        return order;
      });

    // Dos altas simultáneas pueden leer el mismo último número: el índice
    // único (empresa, número) rechaza la segunda, que reintenta con el
    // siguiente.
    for (let attempt = 1; ; attempt++) {
      try {
        return await createOrder();
      } catch (error) {
        const duplicated = (error as { code?: string }).code === 'P2002';
        if (!duplicated || attempt >= MAX_NUMBER_ATTEMPTS) throw error;
      }
    }
  }

  private async nextOrderNumber(tenantId: string, tx: PrismaClientOrTx) {
    const last = await this.purchaseOrdersRepository.findLastOrderNumber(
      tenantId,
      tx,
    );
    const year = String(new Date().getFullYear()).slice(-2);
    const next = orderSequence(last?.orderNumber ?? null) + 1;
    return `OC-${year}-${String(next).padStart(6, '0')}`;
  }

  async send(tenantId: string, id: string, userId?: string) {
    const order = await this.changeStatus(tenantId, id, {
      from: ['PENDING'],
      to: 'SENT',
      userId,
      action: 'purchase.order.sent',
      refusal: 'Solo se puede enviar una orden en borrador',
    });
    // El PDF es lo que se le manda al proveedor: se deja pedido al enviar,
    // sin esperarlo (si falla, se puede volver a pedir desde la orden).
    this.eventEmitter.emit('purchase.order.pdf.requested', {
      tenantId,
      purchaseOrderId: id,
      requestedById: userId,
    });
    return order;
  }

  // También desde borrador: el proveedor puede confirmar por teléfono sin que
  // la orden se haya enviado desde el sistema.
  async confirm(tenantId: string, id: string, userId?: string) {
    const order = await this.changeStatus(tenantId, id, {
      from: ['PENDING', 'SENT'],
      to: 'CONFIRMED',
      userId,
      action: 'purchase.order.confirmed',
      refusal: 'Solo se puede confirmar una orden en borrador o enviada',
    });
    this.eventEmitter.emit('purchase.order.confirmed', {
      tenantId,
      purchaseOrderId: id,
    });
    return order;
  }

  // Con mercadería recibida ya hay stock y una cuenta por pagar que dependen
  // de la orden: a partir de ahí no se cancela.
  cancel(tenantId: string, id: string, reason: string, userId?: string) {
    return this.changeStatus(tenantId, id, {
      from: ['PENDING', 'SENT', 'CONFIRMED'],
      to: 'CANCELLED',
      userId,
      reason: reason.trim(),
      action: 'purchase.order.cancelled',
      refusal: 'No se puede cancelar una orden con mercadería recibida',
    });
  }

  private async changeStatus(
    tenantId: string,
    id: string,
    change: {
      from: PurchaseOrderStatus[];
      to: PurchaseOrderStatus;
      userId?: string;
      reason?: string;
      action: string;
      refusal: string;
    },
  ) {
    const order = await this.findOne(tenantId, id);
    if (!change.from.includes(order.status)) {
      throw new UnprocessableEntityException(
        `${change.refusal}: esta orden está ${STATUS_LABEL[order.status]}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await this.purchaseOrdersRepository.transition(
        tenantId,
        id,
        change.from,
        change.to,
        tx,
      );
      if (count === 0) {
        throw new ConflictException(
          'La orden cambió de estado mientras tanto. Volvé a cargarla.',
        );
      }
      await this.purchaseOrdersRepository.recordStatusChange(
        {
          tenantId,
          purchaseOrderId: id,
          fromStatus: order.status,
          toStatus: change.to,
          reason: change.reason ?? null,
          changedById: change.userId ?? null,
        },
        tx,
      );
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId: change.userId,
      module: 'procurement',
      action: change.action,
      resourceId: id,
      before: { status: order.status },
      after: { status: change.to, reason: change.reason },
    } satisfies AuditLogEvent);
    return this.purchaseOrdersRepository.findById(tenantId, id);
  }
}
