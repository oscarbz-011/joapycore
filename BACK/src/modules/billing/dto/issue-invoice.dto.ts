import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class IssueInvoiceDto {
  @ApiProperty({
    enum: ['CASH', 'CREDIT'],
    description: 'Condición de venta: contado o crédito',
  })
  @IsIn(['CASH', 'CREDIT'])
  paymentCondition!: 'CASH' | 'CREDIT';

  @ApiPropertyOptional({
    description: 'Fecha de vencimiento (requerida para ventas a crédito)',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: 'Método de pago (requerido para ventas al contado)',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
