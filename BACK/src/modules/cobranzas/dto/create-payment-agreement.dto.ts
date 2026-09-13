import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class CreatePaymentAgreementDto {
  @ApiProperty({ description: 'ID del cliente' })
  @IsString()
  customerId: string;

  @ApiPropertyOptional({ description: 'ID del préstamo en mora' })
  @IsString()
  @IsOptional()
  loanId?: string;

  @ApiProperty({ description: 'Deuda total original' })
  @IsNumber()
  @IsPositive()
  originalDebt: number;

  @ApiProperty({ description: 'Número de cuotas acordadas' })
  @IsInt()
  @Min(1)
  agreedInstallments: number;

  @ApiProperty({ description: 'Monto por cuota acordado' })
  @IsNumber()
  @IsPositive()
  agreedAmount: number;

  @ApiProperty({
    example: '2026-09-01',
    description: 'Fecha de inicio del acuerdo',
  })
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
