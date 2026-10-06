import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class VolumeDiscountDto {
  @ApiProperty({ description: 'Total de la orden desde el que aplica' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  minAmount: number;

  @ApiProperty({ description: 'Porcentaje de descuento sobre el total' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  percent: number;
}

export class QuantityDiscountDto {
  @ApiProperty({ description: 'Unidades de la orden desde las que aplica' })
  @IsInt()
  @Min(1)
  minQuantity: number;

  @ApiProperty({ description: 'Porcentaje de descuento sobre el total' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100)
  percent: number;
}

export class CreateSupplierDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  isImporter: boolean;

  @ApiPropertyOptional({
    default: 0,
    description:
      'Plazo de pago en días para las cuentas por pagar de este proveedor (0 = contado)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermDays?: number;

  @ApiPropertyOptional({
    description:
      'Anticipo que pide para despachar, en % del total de la orden (0 = no pide)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  advancePercent?: number | null;

  @ApiPropertyOptional({ description: 'Costo de envío por orden' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingCost?: number | null;

  @ApiPropertyOptional({ description: 'Días que tarda en entregar' })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number | null;

  @ApiPropertyOptional({ description: 'Monto mínimo de una orden' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderAmount?: number | null;

  @ApiPropertyOptional({
    type: [VolumeDiscountDto],
    description: 'Descuentos según el total de la orden',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VolumeDiscountDto)
  volumeDiscounts?: VolumeDiscountDto[];

  @ApiPropertyOptional({
    type: [QuantityDiscountDto],
    description: 'Descuentos según la cantidad de unidades de la orden',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuantityDiscountDto)
  quantityDiscounts?: QuantityDiscountDto[];
}

// Clase y no Partial<CreateSupplierDto>: un tipo no existe en ejecución y el
// pipe de validación dejaba pasar cualquier campo hasta la base.
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
