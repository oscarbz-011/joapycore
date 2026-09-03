import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { RequiredModule } from '../../../common/decorators/required-module.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload.interface';
import { CobranzasService } from '../services/cobranzas.service';
import { AddCollectionNoteDto } from '../dto/add-collection-note.dto';
import { AddVisitDto } from '../dto/add-visit.dto';
import { CreateCollectionRouteDto } from '../dto/create-collection-route.dto';
import { CreatePaymentAgreementDto } from '../dto/create-payment-agreement.dto';
import { UpdateVisitResultDto } from '../dto/update-visit-result.dto';
import { UpdateDelinquencyReportDto } from '../dto/update-delinquency-report.dto';
import type { DelinquencyReportStatus } from '@prisma/client';

@ApiTags('Collections')
@ApiBearerAuth()
@RequiredModule('collections')
@Controller('collections')
export class CobranzasController {
  constructor(private readonly cobranzasService: CobranzasService) {}

  // ── KPIs ──────────────────────────────────────────────────────────────────

  @Get('kpis')
  @Permissions('collections:read')
  @ApiOperation({ summary: 'Obtener KPIs del módulo de cobranzas' })
  getKpis(@CurrentTenant() tenantId: string) {
    return this.cobranzasService.getKpis(tenantId);
  }

  // ── Routes ─────────────────────────────────────────────────────────────────

  @Get('routes')
  @Permissions('collections:read')
  @ApiOperation({ summary: 'Listar rutas de cobranza' })
  @ApiQuery({ name: 'collectorId', required: false })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['OPEN', 'CLOSED', 'CANCELLED'],
  })
  findAllRoutes(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('collectorId') collectorId?: string,
    @Query('status') status?: string,
  ) {
    // Collectors only see their own routes; managers see all
    const effectiveCollectorId = user.permissions?.includes(
      'collections:manage',
    )
      ? collectorId
      : user.sub;
    return this.cobranzasService.findAllRoutes(tenantId, effectiveCollectorId, {
      status,
    });
  }

  @Get('routes/:id')
  @Permissions('collections:read')
  @ApiOperation({ summary: 'Obtener ruta de cobranza por ID' })
  findRoute(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.cobranzasService.findRoute(tenantId, id);
  }

  @Post('routes')
  @Permissions('collections:manage')
  @ApiOperation({ summary: 'Crear una nueva ruta de cobranza' })
  createRoute(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCollectionRouteDto,
  ) {
    return this.cobranzasService.createRoute(tenantId, dto, user.sub);
  }

  @Post('routes/:id/visits')
  @Permissions('collections:manage')
  @ApiOperation({ summary: 'Agregar una visita a la ruta' })
  addVisit(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') routeId: string,
    @Body() dto: AddVisitDto,
  ) {
    return this.cobranzasService.addVisit(tenantId, routeId, dto, user.sub);
  }

  @Delete('routes/:id/visits/:visitId')
  @HttpCode(HttpStatus.OK)
  @Permissions('collections:manage')
  @ApiOperation({ summary: 'Eliminar una visita de la ruta' })
  removeVisit(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') routeId: string,
    @Param('visitId') visitId: string,
  ) {
    return this.cobranzasService.removeVisit(
      tenantId,
      routeId,
      visitId,
      user.sub,
    );
  }

  @Patch('routes/:id/visits/:visitId/result')
  @HttpCode(HttpStatus.OK)
  @Permissions('collections:collect')
  @ApiOperation({ summary: 'Registrar resultado de una visita (cobrador)' })
  recordVisitResult(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') routeId: string,
    @Param('visitId') visitId: string,
    @Body() dto: UpdateVisitResultDto,
  ) {
    return this.cobranzasService.recordVisitResult(
      tenantId,
      routeId,
      visitId,
      dto,
      user.sub,
    );
  }

  @Post('routes/:id/close')
  @HttpCode(HttpStatus.OK)
  @Permissions('collections:manage')
  @ApiOperation({ summary: 'Cerrar una ruta de cobranza' })
  closeRoute(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.cobranzasService.closeRoute(tenantId, id, user.sub);
  }

  @Post('routes/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions('collections:manage')
  @ApiOperation({ summary: 'Cancelar una ruta de cobranza' })
  cancelRoute(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.cobranzasService.cancelRoute(tenantId, id, user.sub);
  }

  // ── Payment Agreements ──────────────────────────────────────────────────────

  @Get('agreements')
  @Permissions('collections:read')
  @ApiOperation({ summary: 'Listar acuerdos de pago' })
  @ApiQuery({ name: 'customerId', required: false })
  findAllAgreements(
    @CurrentTenant() tenantId: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.cobranzasService.findAllAgreements(tenantId, customerId);
  }

  @Get('agreements/:id')
  @Permissions('collections:read')
  @ApiOperation({ summary: 'Obtener acuerdo de pago por ID' })
  findAgreement(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.cobranzasService.findAgreement(tenantId, id);
  }

  @Post('agreements')
  @Permissions('collections:manage')
  @ApiOperation({ summary: 'Crear un acuerdo de pago con cliente en mora' })
  createAgreement(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePaymentAgreementDto,
  ) {
    return this.cobranzasService.createAgreement(tenantId, dto, user.sub);
  }

  @Post('agreements/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Permissions('collections:manage')
  @ApiOperation({ summary: 'Aprobar un acuerdo de pago' })
  approveAgreement(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.cobranzasService.approveAgreement(tenantId, id, user.sub);
  }

  @Patch('agreements/:id/status')
  @HttpCode(HttpStatus.OK)
  @Permissions('collections:manage')
  @ApiOperation({
    summary: 'Actualizar estado del acuerdo (FULFILLED/BROKEN/CANCELLED)',
  })
  updateAgreementStatus(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('status') status: 'FULFILLED' | 'BROKEN' | 'CANCELLED',
  ) {
    return this.cobranzasService.updateAgreementStatus(
      tenantId,
      id,
      status,
      user.sub,
    );
  }

  // ── Collection Notes ────────────────────────────────────────────────────────

  @Get('customers/:customerId/notes')
  @Permissions('collections:read')
  @ApiOperation({ summary: 'Obtener historial de interacciones de un cliente' })
  findNotesByCustomer(
    @CurrentTenant() tenantId: string,
    @Param('customerId') customerId: string,
  ) {
    return this.cobranzasService.findNotesByCustomer(tenantId, customerId);
  }

  @Post('customers/notes')
  @Permissions('collections:collect')
  @ApiOperation({ summary: 'Registrar nota/interacción con un cliente' })
  addNote(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddCollectionNoteDto,
  ) {
    return this.cobranzasService.addNote(tenantId, dto, user.sub);
  }

  // ── Morosos ──────────────────────────────────────────────────────────────

  @Get('delinquency-reports')
  @Permissions('collections:read')
  @ApiOperation({
    summary:
      'Listar candidatos a moroso — detectados automáticamente al cruzar el umbral de meses de mora configurado',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING_REVIEW', 'REPORTED', 'EXCLUDED'],
  })
  findAllDelinquencyReports(
    @CurrentTenant() tenantId: string,
    @Query('status') status?: DelinquencyReportStatus,
  ) {
    return this.cobranzasService.findAllDelinquencyReports(tenantId, status);
  }

  @Get('delinquency-reports/:id')
  @Permissions('collections:read')
  @ApiOperation({ summary: 'Obtener un registro de moroso por ID' })
  findDelinquencyReport(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.cobranzasService.findDelinquencyReport(tenantId, id);
  }

  @Patch('delinquency-reports/:id')
  @HttpCode(HttpStatus.OK)
  @Permissions('collections:manage')
  @ApiOperation({
    summary: 'Marcar un candidato como reportado al buró (manual) o excluirlo',
  })
  updateDelinquencyReport(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDelinquencyReportDto,
  ) {
    return this.cobranzasService.updateDelinquencyReportStatus(
      tenantId,
      id,
      dto,
      user.sub,
    );
  }
}
