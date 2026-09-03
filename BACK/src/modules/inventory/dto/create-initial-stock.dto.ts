import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockInitialSourceType } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

// Flujo propio de carga inicial (reason=INITIAL) — deliberadamente NO
// reutiliza CreateStockMovementDto: no pasa por Compras, y necesita un
// "origen" documentado que ese DTO genérico no tiene.
export class CreateInitialStockDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({
    enum: StockInitialSourceType,
    description:
      'De dónde provino este stock — queda documentado, no finge ser una compra real',
  })
  @IsEnum(StockInitialSourceType)
  initialSourceType: StockInitialSourceType;

  @ApiPropertyOptional({ description: 'Solo si el producto usa lotes' })
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({
    description: 'Requerido si se especifica batchNumber',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'N/S para productos serializados — debe coincidir con quantity',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
