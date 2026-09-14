import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { MarkupType, OrderType, SaleType } from '@prisma/client';
import { SaleOrderItemDto } from '../../../common/contracts/sale-order-item.dto';

export { SaleOrderItemDto } from '../../../common/contracts/sale-order-item.dto';

export class CreateSaleOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({
    description: 'Override del vendedor (solo con sales:manage)',
  })
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional({
    enum: OrderType,
    description: 'Tipo de pedido (STANDARD, QUOTE, WHOLESALE)',
  })
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

  @ApiPropertyOptional({
    enum: MarkupType,
    description: 'Tipo de recargo de entrega/zona',
  })
  @IsOptional()
  @IsEnum(MarkupType)
  surchargeType?: MarkupType;

  @ApiPropertyOptional({ description: 'Valor del recargo (% o monto fijo)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  surchargeAmount?: number;

  @ApiPropertyOptional({
    description: 'Motivo del recargo (Flete, Zona lejana, etc.)',
  })
  @IsOptional()
  @IsString()
  surchargeReason?: string;
}
