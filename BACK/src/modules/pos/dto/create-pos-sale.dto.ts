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
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { SaleOrderItemDto } from '../../../common/contracts/sale-order-item.dto';

export class PosPaymentEntryDto {
  @ApiProperty()
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Referencia o número de comprobante' })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class CreatePosSaleDto {
  @ApiPropertyOptional({
    description:
      'Cliente identificado. Si se omite, se usa "Consumidor Final".',
  })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ type: [SaleOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleOrderItemDto)
  items!: SaleOrderItemDto[];

  @ApiProperty({
    type: [PosPaymentEntryDto],
    description: 'Uno o más métodos de pago',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosPaymentEntryDto)
  payments!: PosPaymentEntryDto[];

  @ApiPropertyOptional({
    description:
      'Número de la hoja del talonario; solo si la caja factura con talonario de imprenta',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9_999_999)
  documentNumber?: number;
}
