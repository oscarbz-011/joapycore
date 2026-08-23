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
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class PayInstallmentItemDto {
  @ApiProperty({ description: 'UUID de la cuota' })
  @IsUUID()
  installmentId: string;

  @ApiProperty({ description: 'Monto a aplicar a esta cuota' })
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class PayInstallmentsDto {
  @ApiProperty({
    type: [PayInstallmentItemDto],
    description: 'Cuotas seleccionadas y el monto a aplicar a cada una',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayInstallmentItemDto)
  items: PayInstallmentItemDto[];

  @ApiProperty({ enum: PaymentMethod, description: 'Método de pago' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ description: 'Fecha del pago (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({ description: 'Número de referencia o comprobante' })
  @IsOptional()
  @IsString()
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'Observaciones del pago' })
  @IsOptional()
  @IsString()
  notes?: string;
}
