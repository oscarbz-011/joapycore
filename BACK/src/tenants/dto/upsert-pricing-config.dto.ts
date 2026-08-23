import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { MarkupMethod } from '@prisma/client';

export class UpsertPricingConfigDto {
  @ApiProperty({
    enum: MarkupMethod,
    description: 'Método de cálculo del precio de venta',
  })
  @IsEnum(MarkupMethod)
  markupMethod: MarkupMethod;

  @ApiProperty({
    description: '% o valor fijo a aplicar sobre el costo según markupMethod',
  })
  @IsNumber()
  @IsPositive()
  defaultMarkup: number;
}
