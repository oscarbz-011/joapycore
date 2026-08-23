import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsPositive, Min } from 'class-validator';

export class CreateCreditPlanDto {
  @ApiProperty({ description: 'Número de cuotas (ej. 3, 6, 12, 24)' })
  @IsInt()
  @Min(1)
  installments: number;

  @ApiProperty({
    description: '% de interés total sobre el monto (ej. 15 = 15%)',
  })
  @IsNumber()
  @IsPositive()
  interestRate: number;
}
