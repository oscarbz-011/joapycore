import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PosPrintFormat, Prisma } from '@prisma/client';
import {
  BILLING_GATEWAY,
  type BillingGateway,
} from '../../../common/contracts/billing-gateway.contract';
import { FilesService } from '../../../files/files.service';
import { PosTerminalsRepository } from '../repositories/pos-terminals.repository';
import { CreatePosTerminalDto } from '../dto/create-pos-terminal.dto';
import { UpdatePosTerminalDto } from '../dto/update-pos-terminal.dto';

const THERMAL_FORMATS: PosPrintFormat[] = [
  PosPrintFormat.THERMAL_58,
  PosPrintFormat.THERMAL_80,
];

@Injectable()
export class PosTerminalsService {
  constructor(
    private readonly posTerminalsRepository: PosTerminalsRepository,
    @Inject(BILLING_GATEWAY) private readonly billing: BillingGateway,
    private readonly filesService: FilesService,
  ) {}

  findAll(tenantId: string) {
    return this.posTerminalsRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const terminal = await this.posTerminalsRepository.findById(tenantId, id);
    if (!terminal) throw new NotFoundException('Caja no encontrada');
    return terminal;
  }

  async create(tenantId: string, dto: CreatePosTerminalDto) {
    try {
      return await this.posTerminalsRepository.create(tenantId, dto);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe una caja con ese nombre en esta sucursal',
        );
      }
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: UpdatePosTerminalDto) {
    const terminal = await this.findOne(tenantId, id);

    if (dto.invoiceSeriesId) {
      const series = await this.billing.findSeries(
        tenantId,
        dto.invoiceSeriesId,
      );
      if (
        !series ||
        !series.isInvoiceSeries ||
        series.branchId !== terminal.branchId
      ) {
        throw new UnprocessableEntityException(
          'La serie tiene que ser de facturas y de la sucursal de la caja',
        );
      }
      if (series.modality === 'ELECTRONIC') {
        throw new UnprocessableEntityException(
          'La facturación electrónica todavía no está disponible',
        );
      }
    }

    if (dto.thermalPaperReportFileId) {
      await this.filesService
        .getById(tenantId, dto.thermalPaperReportFileId)
        .catch(() => {
          throw new UnprocessableEntityException(
            'El informe del papel térmico no existe',
          );
        });
    }

    // RG 27/19: la factura en papel térmico exige un papel que dure al
    // menos 5 años, respaldado por el informe del proveedor, y sus
    // condiciones de conservación impresas en la factura.
    const printFormat = dto.printFormat ?? terminal.printFormat;
    const report =
      dto.thermalPaperReportFileId !== undefined
        ? dto.thermalPaperReportFileId
        : terminal.thermalPaperReportFileId;
    const conservation =
      dto.thermalPaperConservation !== undefined
        ? dto.thermalPaperConservation
        : terminal.thermalPaperConservation;
    if (
      THERMAL_FORMATS.includes(printFormat) &&
      (!report || !conservation?.trim())
    ) {
      throw new UnprocessableEntityException(
        'Para imprimir la factura en papel térmico cargá el informe de durabilidad del papel y sus condiciones de conservación (RG 27/19)',
      );
    }

    return this.posTerminalsRepository.update(tenantId, id, {
      ...dto,
      ...(dto.thermalPaperConservation !== undefined
        ? {
            thermalPaperConservation:
              dto.thermalPaperConservation?.trim() || null,
          }
        : {}),
    });
  }
}
