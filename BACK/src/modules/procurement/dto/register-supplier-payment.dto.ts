import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class RegisterSupplierPaymentDto {
  @ApiProperty({ description: 'Monto del pago (PYG)', example: 1000000 })
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ description: 'Fecha del pago', example: '2026-06-21' })
  @IsDateString()
  paymentDate: string;

  @ApiPropertyOptional({
    description: 'Número de transferencia, cheque u otro comprobante',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
