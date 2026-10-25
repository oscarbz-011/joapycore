import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CustomersRepository } from '../repositories/customers.repository';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { toTitleCase } from '../../../common/utils/normalize.util';
import { rucProblem } from '../../../common/utils/ruc.util';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import type { Prisma } from '@prisma/client';
import {
  orderByFrom,
  pageWindow,
  paginated,
  searchWords,
} from '../../../common/pagination/pagination';
import { PageCustomersDto } from '../dto/page-customers.dto';

type CustomerOrder = Prisma.CustomerOrderByWithRelationInput[];
type Direction = 'asc' | 'desc';

// Por apellido primero, como se busca a una persona en una lista. `id` al
// final deja el orden estable entre páginas cuando hay empates.
const byName = (direction: Direction): CustomerOrder => [
  { lastName: direction },
  { firstName: direction },
  { id: 'asc' },
];
const by =
  (field: keyof Prisma.CustomerOrderByWithRelationInput) =>
  (direction: Direction): CustomerOrder => [
    { [field]: { sort: direction, nulls: 'last' } },
    { id: 'asc' },
  ];

const DEFAULT_CUSTOMER_ORDER = byName('asc');
const CUSTOMER_ORDER: Record<string, (direction: Direction) => CustomerOrder> =
  {
    name: byName,
    code: by('customerCode'),
    documentType: by('documentType'),
    document: by('documentNumber'),
    phone: by('phone'),
    email: by('email'),
    city: by('city'),
    status: (direction) => [{ isActive: direction }, { id: 'asc' }],
  };

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(tenantId: string) {
    return this.customersRepository.findAll(tenantId);
  }

  /** Una página del listado, buscada y ordenada en la base. */
  async findPage(tenantId: string, query: PageCustomersDto) {
    const window = pageWindow(query);
    const { items, total } = await this.customersRepository.findPage(tenantId, {
      words: searchWords(query.q),
      orderBy: orderByFrom(query, CUSTOMER_ORDER, DEFAULT_CUSTOMER_ORDER),
      skip: window.skip,
      take: window.take,
    });
    return paginated(items, total, window);
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.customersRepository.findById(tenantId, id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto, userId?: string) {
    this.assertValidRuc(dto.documentType, dto.documentNumber);
    await this.assertDocumentAvailable(
      tenantId,
      dto.documentType ?? null,
      dto.documentNumber,
    );
    if (dto.email) {
      const existing = await this.customersRepository.findByEmail(
        tenantId,
        dto.email,
      );
      if (existing)
        throw new ConflictException('Ya existe un cliente con ese email');
    }
    const customerCode = await this.generateCustomerCode(tenantId);
    const customer = await this.customersRepository.create(tenantId, {
      ...dto,
      ...this.casedNames(dto, dto.taxpayerType),
      customerCode,
    });

    // Sin listeners de negocio propios hoy — existe para que el bridge de
    // WebSocket (WsBridgeListener, escucha *todo* evento) empuje la
    // actualización a los clientes conectados sin que cada pantalla tenga
    // que refrescar sola. Ver front/lib/ws-event-map.ts.
    this.eventEmitter.emit('customer.created', {
      tenantId,
      customerId: customer.id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'customer.created',
      resourceId: customer.id,
      after: customer,
    } satisfies AuditLogEvent);

    return customer;
  }

  async update(
    tenantId: string,
    id: string,
    dto: Partial<CreateCustomerDto>,
    userId?: string,
  ) {
    const before = await this.findOne(tenantId, id);
    if (dto.documentNumber !== undefined || dto.documentType !== undefined) {
      const documentType = dto.documentType ?? before.documentType;
      const documentNumber = dto.documentNumber ?? before.documentNumber;
      // Clientes cargados antes de validar el RUC: se pueden editar sin
      // corregirlo mientras no se toque el documento.
      const documentChanged =
        documentType !== before.documentType ||
        documentNumber?.trim() !== before.documentNumber?.trim();
      if (documentChanged) this.assertValidRuc(documentType, documentNumber);
      await this.assertDocumentAvailable(
        tenantId,
        dto.documentType ?? before.documentType ?? null,
        dto.documentNumber ?? before.documentNumber,
        id,
      );
    }
    if (dto.email) {
      const existing = await this.customersRepository.findByEmail(
        tenantId,
        dto.email,
        id,
      );
      if (existing)
        throw new ConflictException('Ya existe un cliente con ese email');
    }
    const customer = await this.customersRepository.update(tenantId, id, {
      ...dto,
      ...this.casedNames(dto, dto.taxpayerType ?? before.taxpayerType),
    });

    this.eventEmitter.emit('customer.updated', { tenantId, customerId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'customer.updated',
      resourceId: id,
      before,
      after: customer,
    } satisfies AuditLogEvent);

    return customer;
  }

  // Calificación 6: el cliente no puede recibir un crédito nuevo hasta que
  // se le quite la marca. Ver CreditEvaluationService.
  async markUncollectible(
    tenantId: string,
    id: string,
    reason: string,
    userId?: string,
  ) {
    await this.findOne(tenantId, id);
    const mark = {
      uncollectibleAt: new Date(),
      uncollectibleReason: reason.trim(),
    };
    await this.customersRepository.setUncollectible(tenantId, id, mark);
    this.emitUncollectibleChange(tenantId, id, userId, 'marked', mark);
    return this.findOne(tenantId, id);
  }

  async clearUncollectible(tenantId: string, id: string, userId?: string) {
    const before = await this.findOne(tenantId, id);
    await this.customersRepository.setUncollectible(tenantId, id, {
      uncollectibleAt: null,
      uncollectibleReason: null,
    });
    this.emitUncollectibleChange(tenantId, id, userId, 'cleared', {
      uncollectibleAt: before.uncollectibleAt,
      uncollectibleReason: before.uncollectibleReason,
    });
    return this.findOne(tenantId, id);
  }

  private emitUncollectibleChange(
    tenantId: string,
    customerId: string,
    userId: string | undefined,
    change: 'marked' | 'cleared',
    mark: { uncollectibleAt: Date | null; uncollectibleReason: string | null },
  ) {
    this.eventEmitter.emit('customer.updated', { tenantId, customerId });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: `customer.uncollectible.${change}`,
      resourceId: customerId,
      ...(change === 'marked' ? { after: mark } : { before: mark }),
    } satisfies AuditLogEvent);
  }

  async delete(tenantId: string, id: string, userId?: string) {
    await this.findOne(tenantId, id);
    const customer = await this.customersRepository.softDelete(tenantId, id);

    this.eventEmitter.emit('customer.deleted', { tenantId, customerId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'sales',
      action: 'customer.deleted',
      resourceId: id,
    } satisfies AuditLogEvent);

    return customer;
  }

  // La razón social de una empresa se guarda tal como la registró (ej. "TIPS
  // S.A."); el nombre de una persona se capitaliza.
  private casedNames(
    dto: Partial<Pick<CreateCustomerDto, 'firstName' | 'lastName'>>,
    taxpayerType: CreateCustomerDto['taxpayerType'] | null,
  ) {
    if (taxpayerType === 'COMPANY') {
      return {
        ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: '' } : {}),
      };
    }
    return {
      ...(dto.firstName ? { firstName: toTitleCase(dto.firstName) } : {}),
      ...(dto.lastName ? { lastName: toTitleCase(dto.lastName) } : {}),
    };
  }

  // Una factura con un RUC mal escrito no sirve al cliente para su crédito
  // fiscal.
  private assertValidRuc(
    documentType: CreateCustomerDto['documentType'] | null,
    documentNumber: string | null | undefined,
  ) {
    if (documentType !== 'RUC' || !documentNumber?.trim()) return;
    const problem = rucProblem(documentNumber);
    if (problem) throw new UnprocessableEntityException(problem);
  }

  // El mismo documento no puede identificar a dos clientes activos: se
  // duplicaban historiales de crédito y cuentas por cobrar de una misma
  // persona. No es un índice único en la base porque ya existen duplicados
  // que hay que resolver a mano.
  private async assertDocumentAvailable(
    tenantId: string,
    documentType: CreateCustomerDto['documentType'] | null,
    documentNumber: string | null | undefined,
    excludeId?: string,
  ) {
    const number = documentNumber?.trim();
    if (!number) return;
    const existing = await this.customersRepository.findByDocument(
      tenantId,
      documentType ?? null,
      number,
      excludeId,
    );
    if (existing) {
      throw new ConflictException(
        `Ya existe un cliente con ese documento${existing.customerCode ? ` (${existing.customerCode})` : ''}`,
      );
    }
  }

  private async generateCustomerCode(tenantId: string): Promise<string> {
    const year = String(new Date().getFullYear()).slice(-2);
    const last = await this.customersRepository.findLastCode(tenantId);
    if (!last?.customerCode) return `CLI-${year}-000001`;
    const match = last.customerCode.match(/^CLI-\d{2}-(\d+)$/);
    if (!match) return `CLI-${year}-000001`;
    const next = parseInt(match[1], 10) + 1;
    return `CLI-${year}-${String(next).padStart(6, '0')}`;
  }
}
