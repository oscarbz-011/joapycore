import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class IssueInvoiceDto {
  @ApiProperty({ enum: ['CASH', 'CREDIT'], description: 'Condición de venta: contado o crédito' })
  @IsIn(['CASH', 'CREDIT'])
  paymentCondition: 'CASH' | 'CREDIT';

  @ApiPropertyOptional({ description: 'Fecha de vencimiento (requerida para ventas a crédito)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Número de factura timbrada' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoiceNumber?: string;

  @ApiPropertyOptional({ description: 'Prefijo o timbrado' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoicePrefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
