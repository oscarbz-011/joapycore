import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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
}
