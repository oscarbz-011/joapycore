import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdatePayrollConfigDto {
  @ApiPropertyOptional({ description: 'Salario mínimo vigente en PYG' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minimumWage?: number;

  @ApiPropertyOptional({ description: 'Tasa IPS empleado (ej: 0.09)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ipsEmployeeRate?: number;

  @ApiPropertyOptional({ description: 'Tasa IPS empleador (ej: 0.165)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  ipsEmployerRate?: number;
}
