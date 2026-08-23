import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class SalePaymentEntryDto {
  @ApiProperty({ description: 'Monto' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: PaymentMethod, description: 'Método de pago' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ description: 'Fecha del pago (ISO 8601)' })
  @IsDateString()
  paymentDate: string;

  @ApiPropertyOptional({ description: 'Referencia o número de comprobante' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CollectPaymentDto {
  @ApiProperty({
    type: [SalePaymentEntryDto],
    description: 'Uno o más métodos de pago',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentEntryDto)
  payments: SalePaymentEntryDto[];
}
