import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { UNIT_CODES } from '../../../common/units/units-of-measure';

export class CreateProductPresentationDto {
  @ApiProperty({ example: 'Plancha entera' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    description: 'Unidad SIFEN con la que se factura la presentación',
    default: 77,
  })
  @IsOptional()
  @IsIn(UNIT_CODES)
  unitCode?: number;

  @ApiPropertyOptional({
    description:
      'Cuánto de la unidad del producto lleva. Solo para unidades que no se calculan con medidas (pack de 6, bolsa de 25 kg).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  factor?: number;

  @ApiPropertyOptional({
    description: 'Largo, en la unidad lineal del producto',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  length?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  height?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  salePrice: number;
}

export class UpdateProductPresentationDto extends PartialType(
  CreateProductPresentationDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
