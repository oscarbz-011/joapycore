import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryAssignmentMode } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class AssignDeliveryDto {
  @ApiProperty({ enum: DeliveryAssignmentMode })
  @IsEnum(DeliveryAssignmentMode)
  assignmentMode: DeliveryAssignmentMode;

  @ApiPropertyOptional({
    description: 'Requerido para INTERNAL_EMPLOYEE y EXTERNAL_COURIER_USER',
  })
  @ValidateIf(
    (dto: AssignDeliveryDto) =>
      dto.assignmentMode === DeliveryAssignmentMode.INTERNAL_EMPLOYEE ||
      dto.assignmentMode === DeliveryAssignmentMode.EXTERNAL_COURIER_USER,
  )
  @IsUUID()
  assignedEmployeeId?: string;

  @ApiPropertyOptional({
    description: 'Requerido para EXTERNAL_COMPANY — nombre del courier',
  })
  @ValidateIf(
    (dto: AssignDeliveryDto) =>
      dto.assignmentMode === DeliveryAssignmentMode.EXTERNAL_COMPANY,
  )
  @IsString()
  carrier?: string;

  @ApiPropertyOptional({
    description: 'Número de guía / referencia del courier externo',
  })
  @IsOptional()
  @IsString()
  externalTrackingRef?: string;

  @ApiPropertyOptional({
    example: '2026-10-09',
    description:
      'Día en que sale con el repartidor. Sin valor es hoy. La entrega entra en la ruta del repartidor para ese día',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha tiene que ser un día (AAAA-MM-DD)',
  })
  routeDate?: string;
}
