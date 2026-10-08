import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryShift } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MESSAGE = 'La fecha tiene que ser un día (AAAA-MM-DD)';

export class RouteBoardQueryDto {
  @ApiProperty({ example: '2026-10-08' })
  @Matches(DAY, { message: DAY_MESSAGE })
  date: string;
}

export class CreateDeliveryRouteDto {
  @ApiProperty({ example: '2026-10-08' })
  @Matches(DAY, { message: DAY_MESSAGE })
  date: string;

  @ApiProperty({ enum: DeliveryShift })
  @IsEnum(DeliveryShift)
  shift: DeliveryShift;

  @ApiPropertyOptional({ description: 'Repartidor que hace la ruta' })
  @IsOptional()
  @IsUUID()
  driverEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle?: string;

  @ApiPropertyOptional({ description: 'Nombre para reconocerla (zona, etc.)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class UpdateDeliveryRouteDto {
  @ApiPropertyOptional({
    description: 'Repartidor de la ruta; null la deja sin repartidor',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  driverEmployeeId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
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

export class ScheduleDeliveryDto {
  @ApiProperty({
    example: '2026-10-09',
    description: 'Día para el que queda programada; null la deja sin fecha',
    nullable: true,
  })
  @ValidateIf((_, value) => value !== null)
  @Matches(DAY, { message: DAY_MESSAGE })
  date: string | null;

  @ApiPropertyOptional({ enum: DeliveryShift, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(DeliveryShift)
  shift?: DeliveryShift | null;
}
