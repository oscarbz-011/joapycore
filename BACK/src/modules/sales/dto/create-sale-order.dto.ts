import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { MarkupType, OrderType, SaleType } from '@prisma/client';

export class SaleOrderItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Depósito desde el que se despacha este ítem' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Números de serie para productos serializados',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class CreateSaleOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ description: 'Override del vendedor (solo con sales:manage)' })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional({ enum: OrderType, description: 'Tipo de pedido (STANDARD, QUOTE, WHOLESALE)' })
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @ApiPropertyOptional({ enum: SaleType })
  @IsOptional()
  @IsEnum(SaleType)
  saleType?: SaleType;

  @ApiPropertyOptional({ description: 'Número de cuotas (solo para CREDIT)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [SaleOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleOrderItemDto)
  items: SaleOrderItemDto[];

  @ApiPropertyOptional({ enum: MarkupType, description: 'Tipo de recargo de entrega/zona' })
  @IsOptional()
  @IsEnum(MarkupType)
  surchargeType?: MarkupType;

  @ApiPropertyOptional({ description: 'Valor del recargo (% o monto fijo)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  surchargeAmount?: number;

  @ApiPropertyOptional({ description: 'Motivo del recargo (Flete, Zona lejana, etc.)' })
  @IsOptional()
  @IsString()
  surchargeReason?: string;
}
