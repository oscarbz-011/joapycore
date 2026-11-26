import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/** Medidas de un corte, en la unidad lineal del producto (m² → metros). */
export class SaleLineCutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  length?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  height?: number;
}

// Línea de venta compartida por los canales que crean pedidos (Ventas y POS).
// Vive en common para que POS no dependa de los DTOs del módulo de Ventas.
export class SaleOrderItemDto {
  @ApiPropertyOptional({
    description:
      'UUID del producto. Null para ítems de servicio o línea libre.',
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Descripción libre (requerida cuando productId es null)',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  unitPrice: number;

  @ApiPropertyOptional({
    description:
      'Presentación en la que se vende (cantidad y precio quedan en esa presentación)',
  })
  @IsOptional()
  @IsUUID()
  presentationId?: string;

  @ApiPropertyOptional({
    type: SaleLineCutDto,
    description:
      'Corte a medida: la cantidad son piezas y cada una mueve del stock lo que miden',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SaleLineCutDto)
  cut?: SaleLineCutDto;

  @ApiPropertyOptional({
    description: 'Depósito desde el que se despacha este ítem',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({
    description:
      'Notas/especificaciones libres de la línea (dimensiones, materiales, etc.) — usado en presupuestos de rubros con ítems a medida',
  })
  @IsOptional()
  @IsString()
  specNotes?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Números de serie para productos serializados',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional({
    description:
      'Combo del que salió esta línea (trazabilidad — no afecta stock ni precio, se calculan igual que cualquier línea)',
  })
  @IsOptional()
  @IsUUID()
  comboId?: string;

  @ApiPropertyOptional({
    description:
      'Agrupa las líneas de un mismo combo agregado al pedido (para poder mostrarlas/quitarlas juntas)',
  })
  @IsOptional()
  @IsString()
  comboGroupId?: string;
}
