import { ApiPropertyOptional } from '@nestjs/swagger';
import { InterestComponentFrequency } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateInterestComponentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: InterestComponentFrequency })
  @IsOptional()
  @IsEnum(InterestComponentFrequency)
  frequency?: InterestComponentFrequency;

  @ApiPropertyOptional({
    description:
      '% aplicado sobre el monto de la cuota. Admite hasta 4 decimales para tasas menores a 1% (ej. mora diaria de 0,001%).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  percentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cumulative?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
