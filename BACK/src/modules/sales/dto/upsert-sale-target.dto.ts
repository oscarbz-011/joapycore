import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsNumber, IsString, Matches, Min } from 'class-validator';

export class UpsertSaleTargetDto {
  @ApiProperty({ example: '2025-07', description: 'Period in YYYY-MM format' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period must be in YYYY-MM format' })
  period: string;

  @ApiProperty({ example: 60000000 })
  @IsNumber()
  @Min(0)
  targetAmount: number;
}
