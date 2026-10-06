import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpsertCreditConfigDto {
  @ApiProperty({
    description: 'Habilitar o deshabilitar ventas a crédito para este tenant',
  })
  @IsBoolean()
  isEnabled: boolean;

  @ApiPropertyOptional({
    description:
      'Porcentaje máximo del sueldo del cliente admitido para la cuota de un crédito (null = sin tope)',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxIncomePercentage?: number | null;

  @ApiPropertyOptional({
    description:
      'Día del mes (1-28) en que vencen todas las cuotas de crédito del tenant',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(28)
  dueDayOfMonth?: number;

  @ApiPropertyOptional({
    description:
      'Días de tolerancia después del vencimiento antes de empezar a cobrar mora',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  moraGraceDays?: number;

  @ApiPropertyOptional({
    description:
      'Días de mora a partir de los cuales un cliente entra a la lista de Morosos para gestionar su reporte a Informconf. Vacío = deshabilitado.',
    example: 90,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  delinquencyThresholdDays?: number | null;

  @ApiPropertyOptional({
    description:
      'Calificación del cliente: límite superior de días de atraso promedio de los niveles 1 a 4, en orden creciente. Por encima del último es nivel 5.',
    example: [0, 5, 15, 30],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsInt({ each: true })
  @Min(0, { each: true })
  ratingDelayThresholds?: number[];

  @ApiPropertyOptional({
    description:
      'Días de atraso de una cuota impaga a partir de los cuales el cliente pasa a nivel 6 (incobrable/judicial). Vacío = solo por marca manual.',
    example: 180,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  uncollectibleAfterDays?: number | null;
}
