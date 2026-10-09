import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryRouteStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FAILURE_REASONS, type FailureReason } from '../delivery-route.util';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'La fecha tiene que ser un día (AAAA-MM-DD)';

export class ListDeliveryRoutesDto {
  @ApiPropertyOptional({ enum: DeliveryRouteStatus })
  @IsOptional()
  @IsEnum(DeliveryRouteStatus)
  status?: DeliveryRouteStatus;

  @ApiPropertyOptional({ description: 'Repartidor de la ruta' })
  @IsOptional()
  @IsUUID()
  driverEmployeeId?: string;

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Desde este día' })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Hasta este día' })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class UpdateDeliveryRouteDto {
  @ApiPropertyOptional({ description: 'Repartidor que hace la ruta' })
  @IsOptional()
  @IsUUID()
  driverEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle?: string;

  @ApiPropertyOptional({ example: '2026-10-09', description: 'Día de salida' })
  @IsOptional()
  @Matches(DAY, { message: DAY_MESSAGE })
  date?: string;
}

export class AddRouteDeliveryDto {
  @ApiProperty()
  @IsUUID()
  deliveryNoteId: string;

  @ApiPropertyOptional({
    description:
      'Lugar en el recorrido (0 = primera parada). Sin él va al final',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class ReorderRouteDto {
  @ApiProperty({
    description: 'Todas las paradas de la ruta, en el orden nuevo',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  deliveryNoteIds: string[];
}

export class StartRouteDto {
  @ApiPropertyOptional({ description: 'Vehículo con el que sale' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle?: string;
}

// Llegar y entregar son de cada parada: no se marcan para toda la ruta.
export const ROUTE_CHECKPOINTS = ['LEFT_WAREHOUSE', 'IN_TRANSIT'] as const;
export type RouteCheckpoint = (typeof ROUTE_CHECKPOINTS)[number];

export class RouteCheckpointDto {
  @ApiProperty({ enum: ROUTE_CHECKPOINTS })
  @IsIn(ROUTE_CHECKPOINTS)
  checkpoint: RouteCheckpoint;
}

// Lo que el repartidor marca en la parada de un cliente, para todos sus
// pedidos de la ruta a la vez.
export const CUSTOMER_CHECKPOINTS = [
  'LEFT_WAREHOUSE',
  'IN_TRANSIT',
  'ARRIVED',
] as const;

export class CustomerCheckpointDto {
  @ApiProperty({ enum: CUSTOMER_CHECKPOINTS })
  @IsIn(CUSTOMER_CHECKPOINTS)
  checkpoint: (typeof CUSTOMER_CHECKPOINTS)[number];
}

export class DeliverCustomerStopDto {
  @ApiPropertyOptional({ description: 'Dónde se entregó' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description:
      'true = la ubicación registrada era correcta; false = se corrigió',
  })
  @IsOptional()
  @IsBoolean()
  locationConfirmed?: boolean;
}

export class FailDeliveryDto {
  @ApiProperty({ enum: Object.keys(FAILURE_REASONS) })
  @IsIn(Object.keys(FAILURE_REASONS))
  reason: FailureReason;

  @ApiPropertyOptional({ description: 'Detalle de lo que pasó' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ description: 'Dónde estaba el repartidor' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
