import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

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
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  unitPrice: number;

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
