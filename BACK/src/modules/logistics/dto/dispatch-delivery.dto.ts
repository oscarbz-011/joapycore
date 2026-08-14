import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DispatchDeliveryDto {
  @ApiPropertyOptional({ description: 'Nombre del repartidor o transportista' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @ApiPropertyOptional({ description: 'Vehículo o patente' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
