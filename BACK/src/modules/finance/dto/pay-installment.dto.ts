import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class PayInstallmentDto {
  @ApiProperty({ description: 'Monto abonado' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: 'Observaciones del pago' })
  @IsOptional()
  @IsString()
  notes?: string;
}
