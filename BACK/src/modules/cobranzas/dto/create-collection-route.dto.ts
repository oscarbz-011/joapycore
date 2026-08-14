import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class CreateCollectionRouteDto {
  @ApiProperty({ example: '2026-08-10', description: 'Fecha de la ruta' })
  @IsDate()
  @Type(() => Date)
  routeDate: Date;

  @ApiPropertyOptional({ description: 'ID del cobrador asignado (opcional)' })
  @IsString()
  @IsOptional()
  collectorId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
