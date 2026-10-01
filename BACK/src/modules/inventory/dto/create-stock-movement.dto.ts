import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementReason } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateStockMovementDto {
  @ApiProperty({ enum: MovementReason, description: 'Motivo del movimiento' })
  @IsEnum(MovementReason)
  reason: MovementReason;

  @ApiProperty({
    minimum: 1,
    description:
      'Cantidad (siempre positiva; la dirección la determina el motivo)',
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    enum: ['IN', 'OUT'],
    description:
      'Dirección para motivo ADJUSTMENT. IN = agregar stock, OUT = reducir stock',
  })
  @IsOptional()
  @IsIn(['IN', 'OUT'])
  direction?: 'IN' | 'OUT';

  @ApiProperty({ description: 'Depósito de origen' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({
    description: 'Depósito de destino (solo para TRANSFER)',
  })
  @IsOptional()
  @IsUUID()
  toWarehouseId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Series exactas afectadas cuando el producto es serializado',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateGlobalStockMovementDto extends CreateStockMovementDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsUUID()
  productId: string;
}
