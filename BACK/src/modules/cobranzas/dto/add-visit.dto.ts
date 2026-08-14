import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class AddVisitDto {
  @ApiProperty({ description: 'ID del cliente a visitar' })
  @IsString()
  customerId: string;

  @ApiProperty({ description: 'Monto planeado a cobrar' })
  @IsNumber()
  @IsPositive()
  plannedAmount: number;

  @ApiPropertyOptional({ description: 'ID del préstamo relacionado' })
  @IsString()
  @IsOptional()
  loanId?: string;

  @ApiPropertyOptional({ description: 'ID de la cuota a cobrar' })
  @IsString()
  @IsOptional()
  installmentId?: string;

  @ApiPropertyOptional({ description: 'ID de la cuenta por cobrar relacionada' })
  @IsString()
  @IsOptional()
  arId?: string;

  @ApiPropertyOptional({ description: 'Orden de visita en la ruta', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  visitOrder?: number;
}
