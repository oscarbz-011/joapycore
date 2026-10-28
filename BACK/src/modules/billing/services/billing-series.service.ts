import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BillingDocumentType,
  BillingModality,
  BillingSeries,
  Prisma,
} from '@prisma/client';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';
import { PrismaClientOrTx } from '../../../prisma/types';
import {
  CreateBillingSeriesDto,
  MAX_DOCUMENT_NUMBER,
} from '../dto/create-billing-series.dto';
import { UpdateBillingSeriesDto } from '../dto/update-billing-series.dto';
import { BillingSeriesRepository } from '../repositories/billing-series.repository';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import type { SeriesNumbering } from '../types/series-numbering';
import {
  formFitProblem as layoutFitProblem,
  resolvePreprintedLayout,
} from '../utils/preprinted-layout';

type SeriesWithUsage = Awaited<
  ReturnType<BillingSeriesRepository['findAll']>
>[number];

const toCalendarDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const layoutColumn = (layout: CreateBillingSeriesDto['printLayout']) =>
  layout === null
    ? Prisma.DbNull
    : (JSON.parse(JSON.stringify(layout)) as Prisma.InputJsonValue);

// El diseño de impresión se devuelve siempre completo, con el estándar donde
// la serie no tiene uno propio.
const present = <T extends { printLayout: Prisma.JsonValue }>(series: T) => ({
  ...series,
  printLayout: resolvePreprintedLayout(series.printLayout),
});

const formatDay = (value: Date) =>
  value.toISOString().slice(0, 10).split('-').reverse().join('/');

/**
 * Por qué una serie no puede numerar un documento en ese día, o null si
 * puede. La vigencia se compara por día calendario de Paraguay.
 */
export function seriesProblem(
  series: Pick<
    BillingSeries,
    'isActive' | 'modality' | 'timbrado' | 'validFrom' | 'validUntil'
  >,
  at: Date,
): string | null {
  if (!series.isActive) return 'La serie está desactivada';
  if (series.modality === BillingModality.ELECTRONIC) {
    return 'La facturación electrónica todavía no está disponible';
  }
  if (!series.timbrado || !series.validFrom || !series.validUntil) {
    return 'La serie no tiene el timbrado y su vigencia cargados. Completalos en Configuración → Facturación.';
  }
  const day = startOfBusinessDay(at);
  if (day < series.validFrom) {
    return `El timbrado recién es válido desde el ${formatDay(series.validFrom)}`;
  }
  if (day > series.validUntil) {
    return `El timbrado venció el ${formatDay(series.validUntil)}`;
  }
  return null;
}

@Injectable()
export class BillingSeriesService {
  constructor(
    private readonly seriesRepository: BillingSeriesRepository,
    private readonly billingSources: BillingSourcesRepository,
  ) {}

  async findAll(tenantId: string) {
    const series = await this.seriesRepository.findAll(tenantId);
    return series.map(present);
  }

  async findOne(tenantId: string, id: string) {
    const series = await this.seriesRepository.findById(tenantId, id);
    if (!series) throw new NotFoundException('Serie no encontrada');
    return present(series);
  }

  async create(tenantId: string, dto: CreateBillingSeriesDto) {
    await this.assertBranch(tenantId, dto.branchId);
    const data = {
      tenantId,
      branchId: dto.branchId,
      documentType: dto.documentType ?? BillingDocumentType.INVOICE,
      modality: dto.modality,
      timbrado: dto.timbrado,
      validFrom: toCalendarDate(dto.validFrom),
      validUntil: dto.validUntil ? toCalendarDate(dto.validUntil) : null,
      establecimiento: dto.establecimiento,
      puntoExpedicion: dto.puntoExpedicion,
      rangeFrom: dto.rangeFrom,
      rangeTo: dto.rangeTo,
      nextNumber: dto.nextNumber ?? dto.rangeFrom,
    };
    this.assertConsistent(data);
    const created = await this.saveUnique(() =>
      this.seriesRepository.create({
        ...data,
        ...(dto.printLayout !== undefined
          ? { printLayout: layoutColumn(dto.printLayout) }
          : {}),
      }),
    );
    return present(created);
  }

  async update(tenantId: string, id: string, dto: UpdateBillingSeriesDto) {
    const current = await this.findOne(tenantId, id);
    const used = current._count.invoices > 0;

    if (used) {
      const locked: Exclude<keyof UpdateBillingSeriesDto, 'printLayout'>[] = [
        'branchId',
        'documentType',
        'modality',
        'establecimiento',
        'puntoExpedicion',
        'rangeFrom',
        'nextNumber',
      ];
      // El timbrado y su inicio solo se pueden completar si faltaban (series
      // migradas); cambiarlos alteraría facturas ya emitidas con esta serie.
      if (current.timbrado) locked.push('timbrado');
      if (current.validFrom) locked.push('validFrom');
      const changed = locked.filter(
        (field) =>
          dto[field] !== undefined &&
          String(dto[field]) !== this.currentValue(current, field),
      );
      if (changed.length > 0) {
        throw new UnprocessableEntityException(
          'La serie ya numeró facturas: solo se puede cambiar el fin de vigencia, el fin del rango y si está activa. Para un timbrado nuevo, creá otra serie.',
        );
      }
    }

    if (dto.branchId && dto.branchId !== current.branchId) {
      await this.assertBranch(tenantId, dto.branchId);
    }

    const next = {
      branchId: dto.branchId ?? current.branchId,
      documentType: dto.documentType ?? current.documentType,
      modality: dto.modality ?? current.modality,
      timbrado: dto.timbrado ?? current.timbrado,
      validFrom: dto.validFrom
        ? toCalendarDate(dto.validFrom)
        : current.validFrom,
      validUntil: dto.validUntil
        ? toCalendarDate(dto.validUntil)
        : current.validUntil,
      establecimiento: dto.establecimiento ?? current.establecimiento,
      puntoExpedicion: dto.puntoExpedicion ?? current.puntoExpedicion,
      rangeFrom: dto.rangeFrom ?? current.rangeFrom,
      rangeTo: dto.rangeTo ?? current.rangeTo,
      nextNumber:
        dto.nextNumber ??
        (dto.rangeFrom !== undefined && !used
          ? dto.rangeFrom
          : current.nextNumber),
      isActive: dto.isActive ?? current.isActive,
    };
    this.assertConsistent(next, used ? current.nextNumber - 1 : undefined);
    const updated = await this.saveUnique(() =>
      this.seriesRepository.update(tenantId, id, {
        ...next,
        ...(dto.printLayout !== undefined
          ? { printLayout: layoutColumn(dto.printLayout) }
          : {}),
      }),
    );
    return present(updated);
  }

  /** Por qué los ítems no entran en la hoja del talonario, o null. */
  async formFitProblem(
    tenantId: string,
    seriesId: string,
    itemCount: number,
    tx: PrismaClientOrTx,
  ) {
    const series = await this.seriesRepository.findById(tenantId, seriesId, tx);
    if (!series) throw new NotFoundException('Serie no encontrada');
    return layoutFitProblem(
      resolvePreprintedLayout(series.printLayout),
      itemCount,
    );
  }

  findVoided(tenantId: string, seriesId: string) {
    return this.findOne(tenantId, seriesId).then(() =>
      this.seriesRepository.findVoided(tenantId, seriesId),
    );
  }

  /**
   * Número de una hoja de talonario para volver a imprimir una factura
   * cuya hoja se inutilizó: el indicado o el siguiente sugerido.
   */
  async numberForPreprintedSheet(
    tenantId: string,
    params: { seriesId: string; documentNumber?: number; at: Date },
    tx: PrismaClientOrTx,
  ): Promise<SeriesNumbering> {
    const series = await this.seriesRepository.findById(
      tenantId,
      params.seriesId,
      tx,
    );
    if (!series) throw new NotFoundException('Serie no encontrada');
    if (series.modality !== BillingModality.PREPRINTED) {
      throw new UnprocessableEntityException(
        'Solo se inutilizan hojas de un talonario de imprenta',
      );
    }
    return this.numberForIssue(
      tenantId,
      {
        branchId: series.branchId,
        seriesId: series.id,
        documentNumber: params.documentNumber ?? series.nextNumber,
        at: params.at,
      },
      tx,
    );
  }

  /** Marca como inutilizada una hoja del talonario que no tiene factura. */
  async voidLooseSheet(
    tenantId: string,
    seriesId: string,
    params: {
      documentNumber: number;
      reason: string;
      scanFileId?: string;
      userId?: string;
    },
    tx: PrismaClientOrTx,
  ) {
    const series = await this.seriesRepository.findById(tenantId, seriesId, tx);
    if (!series) throw new NotFoundException('Serie no encontrada');
    if (series.modality !== BillingModality.PREPRINTED) {
      throw new UnprocessableEntityException(
        'Solo se inutilizan hojas de un talonario de imprenta',
      );
    }
    await this.assertPreprintedNumber(series, params.documentNumber, tx);
    await this.recordVoidedSheet(
      tenantId,
      { ...params, seriesId, sequential: params.documentNumber },
      tx,
    );
    await this.seriesRepository.advanceSuggestedNumber(
      tenantId,
      seriesId,
      params.documentNumber,
      tx,
    );
  }

  async recordVoidedSheet(
    tenantId: string,
    params: {
      seriesId: string;
      sequential: number;
      invoiceId?: string;
      reason: string;
      scanFileId?: string;
      userId?: string;
    },
    tx: PrismaClientOrTx,
  ) {
    const series = await this.seriesRepository.findById(
      tenantId,
      params.seriesId,
      tx,
    );
    if (!series) throw new NotFoundException('Serie no encontrada');
    await this.seriesRepository.createVoided(
      {
        tenantId,
        seriesId: series.id,
        serieCode: series.serieCode,
        sequential: params.sequential,
        invoiceId: params.invoiceId ?? null,
        reason: params.reason.trim(),
        scanFileId: params.scanFileId ?? null,
        voidedById: params.userId ?? null,
      },
      tx,
    );
  }

  // Series de la sucursal entre las que se puede elegir al emitir, con el
  // motivo por el que alguna no sirve hoy.
  async findIssueOptions(
    tenantId: string,
    branchId: string | null,
    at: Date = new Date(),
  ) {
    const series = await this.seriesRepository.findActiveForBranch(
      tenantId,
      branchId,
      BillingDocumentType.INVOICE,
    );
    return series.map((s) => ({ ...s, problem: seriesProblem(s, at) }));
  }

  /**
   * Elige la serie y el número de una factura que emite un usuario. Con una
   * sola serie usable no hace falta elegirla. En un talonario de imprenta el
   * número lo carga el usuario; en impresión propia lo asigna la serie.
   */
  async numberForIssue(
    tenantId: string,
    params: {
      branchId: string | null;
      seriesId?: string;
      documentNumber?: number;
      at: Date;
    },
    tx: PrismaClientOrTx,
  ): Promise<SeriesNumbering> {
    const series = await this.pickSeries(tenantId, params, tx);

    if (series.modality === BillingModality.PREPRINTED) {
      if (params.documentNumber === undefined) {
        throw new UnprocessableEntityException(
          'Cargá el número del talonario de la factura',
        );
      }
      await this.assertPreprintedNumber(series, params.documentNumber, tx);
      await this.seriesRepository.advanceSuggestedNumber(
        tenantId,
        series.id,
        params.documentNumber,
        tx,
      );
      return this.numbering(series, params.documentNumber);
    }

    return this.numbering(series, await this.claim(tenantId, series, tx));
  }

  /**
   * Número para una factura que el sistema genera sin intervención de un
   * usuario (intereses moratorios). Solo una serie de impresión propia puede
   * numerarla; si la sucursal factura con talonario o el rango se agotó,
   * devuelve null y la factura queda pendiente de que alguien la numere.
   */
  async numberForAutomatic(
    tenantId: string,
    branchId: string | null,
    at: Date,
    tx: PrismaClientOrTx,
  ): Promise<SeriesNumbering | null> {
    const candidates = await this.seriesRepository.findActiveForBranch(
      tenantId,
      branchId,
      BillingDocumentType.INVOICE,
      tx,
    );
    const series = candidates.find(
      (s) =>
        s.modality === BillingModality.SELF_PRINTED && !seriesProblem(s, at),
    );
    if (!series) return null;
    const number = await this.seriesRepository.claimNextNumber(
      tenantId,
      series.id,
      tx,
    );
    return number === null ? null : this.numbering(series, number);
  }

  private async pickSeries(
    tenantId: string,
    params: { branchId: string | null; seriesId?: string; at: Date },
    tx: PrismaClientOrTx,
  ) {
    if (params.seriesId) {
      const series = await this.seriesRepository.findById(
        tenantId,
        params.seriesId,
        tx,
      );
      if (
        !series ||
        series.documentType !== BillingDocumentType.INVOICE ||
        (params.branchId && series.branchId !== params.branchId)
      ) {
        throw new UnprocessableEntityException(
          'La serie elegida no corresponde a la sucursal de la venta',
        );
      }
      const problem = seriesProblem(series, params.at);
      if (problem) throw new UnprocessableEntityException(problem);
      return series;
    }

    const candidates = await this.seriesRepository.findActiveForBranch(
      tenantId,
      params.branchId,
      BillingDocumentType.INVOICE,
      tx,
    );
    const usable = candidates.filter((s) => !seriesProblem(s, params.at));
    if (usable.length === 1) return usable[0];
    if (usable.length > 1) {
      throw new UnprocessableEntityException(
        'La sucursal tiene más de una serie vigente: elegí con cuál facturar',
      );
    }
    if (candidates.length === 1) {
      throw new UnprocessableEntityException(
        seriesProblem(candidates[0], params.at),
      );
    }
    const branch = params.branchId
      ? await this.billingSources.findBranch(tenantId, params.branchId, tx)
      : null;
    throw new UnprocessableEntityException(
      branch
        ? `No hay una serie de facturas vigente para la sucursal ${branch.name}. Cargala en Configuración → Facturación.`
        : 'No hay una serie de facturas vigente. Cargala en Configuración → Facturación.',
    );
  }

  private async claim(
    tenantId: string,
    series: SeriesWithUsage,
    tx: PrismaClientOrTx,
  ) {
    const number = await this.seriesRepository.claimNextNumber(
      tenantId,
      series.id,
      tx,
    );
    if (number === null) {
      throw new UnprocessableEntityException(
        `Se agotó el rango autorizado de la serie ${series.establecimiento}-${series.puntoExpedicion} (hasta el ${series.rangeTo}). Cargá una serie nueva.`,
      );
    }
    return number;
  }

  private async assertPreprintedNumber(
    series: SeriesWithUsage,
    documentNumber: number,
    tx: PrismaClientOrTx,
  ) {
    if (documentNumber < series.rangeFrom || documentNumber > series.rangeTo) {
      throw new UnprocessableEntityException(
        `El número ${documentNumber} está fuera del rango del talonario (${series.rangeFrom} a ${series.rangeTo})`,
      );
    }
    if (
      await this.seriesRepository.isNumberUsed(
        series.id,
        series.serieCode,
        documentNumber,
        tx,
      )
    ) {
      throw new UnprocessableEntityException(
        `El número ${documentNumber} del talonario ya fue usado o inutilizado`,
      );
    }
  }

  private numbering(
    series: SeriesWithUsage,
    sequential: number,
  ): SeriesNumbering {
    return {
      seriesId: series.id,
      modality: series.modality,
      timbrado: series.timbrado ?? '',
      timbradoValidFrom: series.validFrom,
      timbradoValidUntil: series.validUntil,
      serieCode: series.serieCode,
      establecimiento: series.establecimiento,
      puntoExpedicion: series.puntoExpedicion,
      sequential,
      invoiceNumber: String(sequential).padStart(7, '0'),
      invoicePrefix: `${series.establecimiento}-${series.puntoExpedicion}-`,
    };
  }

  private assertConsistent(
    data: {
      modality: BillingModality;
      timbrado: string | null;
      validFrom: Date | null;
      validUntil: Date | null;
      rangeFrom: number;
      rangeTo: number;
      nextNumber: number;
    },
    lastUsed?: number,
  ) {
    if (data.modality === BillingModality.ELECTRONIC) {
      throw new UnprocessableEntityException(
        'La facturación electrónica todavía no está disponible',
      );
    }
    if (!data.validUntil) {
      throw new UnprocessableEntityException(
        'El timbrado de un talonario o de impresión propia tiene fecha de fin de vigencia',
      );
    }
    if (data.validFrom && data.validFrom > data.validUntil) {
      throw new UnprocessableEntityException(
        'La vigencia termina antes de empezar',
      );
    }
    if (data.rangeFrom > data.rangeTo) {
      throw new UnprocessableEntityException(
        'El rango termina antes de empezar',
      );
    }
    if (lastUsed !== undefined && data.rangeTo < lastUsed) {
      throw new UnprocessableEntityException(
        `El rango no puede terminar antes del último número usado (${lastUsed})`,
      );
    }
    if (
      data.nextNumber < data.rangeFrom ||
      data.nextNumber > Math.min(data.rangeTo + 1, MAX_DOCUMENT_NUMBER + 1)
    ) {
      throw new UnprocessableEntityException(
        'El próximo número tiene que estar dentro del rango',
      );
    }
  }

  private currentValue(
    current: SeriesWithUsage,
    field: keyof UpdateBillingSeriesDto,
  ): string {
    const value: unknown = current[field as keyof SeriesWithUsage];
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object' && value !== null) return '';
    return String(value);
  }

  private async assertBranch(tenantId: string, branchId: string) {
    if (!(await this.billingSources.findBranch(tenantId, branchId))) {
      throw new UnprocessableEntityException('La sucursal no existe');
    }
  }

  private async saveUnique<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe una serie con ese timbrado, establecimiento y punto de expedición',
        );
      }
      throw error;
    }
  }
}
