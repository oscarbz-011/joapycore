import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { AdvancePaymentMode, PaymentMethod } from '@prisma/client';

export class AdvancePaymentDto {
  @ApiProperty({ description: 'Monto del adelanto' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({
    enum: AdvancePaymentMode,
    description:
      'REDUCE_INSTALLMENTS: cancela cuotas desde el final; REDUCE_AMOUNT: redistribuye el saldo entre cuotas restantes',
  })
  @IsEnum(AdvancePaymentMode)
  mode: AdvancePaymentMode;

  @ApiProperty({ enum: PaymentMethod, description: 'Método de pago del adelanto' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Fecha del pago (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({ description: 'Referencia o número de comprobante' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
