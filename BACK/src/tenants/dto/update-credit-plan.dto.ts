import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdateCreditPlanDto {
  @ApiPropertyOptional({ description: '% de interés total sobre el monto' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  interestRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
