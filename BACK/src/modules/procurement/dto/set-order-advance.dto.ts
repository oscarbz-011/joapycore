import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class SetOrderAdvanceDto {
  @ApiProperty({
    description: 'Anticipo que pide la orden; 0 = ninguno, hasta el total',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}
