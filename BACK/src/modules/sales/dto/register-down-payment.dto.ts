import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RegisterDownPaymentDto {
  @ApiProperty({ description: 'Monto de la entrega inicial (pie)' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: PaymentMethod, description: 'Método de pago' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiProperty({ description: 'Fecha del pago (ISO 8601)' })
  @IsDateString()
  paymentDate: string;

  @ApiPropertyOptional({ description: 'Número de comprobante o referencia' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
