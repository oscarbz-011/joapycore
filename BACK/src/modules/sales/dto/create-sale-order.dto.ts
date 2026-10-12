import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MarkupType, OrderType, SaleType } from '@prisma/client';
import { SaleOrderItemDto } from '../../../common/contracts/sale-order-item.dto';

export { SaleOrderItemDto } from '../../../common/contracts/sale-order-item.dto';

export class ProspectDto {
  @ApiProperty({ description: 'Nombre o razón social' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ description: 'CI o RUC' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  document?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;
}

export class ConvertQuoteDto {
  @ApiPropertyOptional({
    description:
      'Cliente registrado al que pasa el pedido. Obligatorio si el presupuesto se hizo con datos cargados a mano',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;
}

export class CreateSaleOrderDto {
  @ApiPropertyOptional({
    description:
      'Cliente registrado. Obligatorio salvo en un presupuesto con `prospect`',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    type: ProspectDto,
    description:
      'Solo presupuestos: datos de una persona o empresa que todavía no es cliente',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProspectDto)
  prospect?: ProspectDto;

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
