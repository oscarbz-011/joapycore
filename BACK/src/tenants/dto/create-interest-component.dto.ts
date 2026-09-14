import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateInterestComponentDto {
  @ApiProperty({
    description: 'Nombre visible del recargo',
    example: 'Gastos administrativos',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ enum: InterestComponentFrequency })
  @IsEnum(InterestComponentFrequency)
  frequency: InterestComponentFrequency;

  @ApiProperty({
    description:
      '% aplicado sobre el monto de la cuota. Admite hasta 4 decimales para tasas menores a 1% (ej. mora diaria de 0,001%).',
    example: 10,
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  percentage: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Solo aplica a MONTHLY: si el cargo crece con cada período vencido (mes 1=10%, mes 2=20%, mes 3=30%) o se cobra el % base una sola vez.',
  })
  @IsOptional()
  @IsBoolean()
  cumulative?: boolean;

  @ApiPropertyOptional({
    description: 'Orden de aplicación al descontar un pago',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
