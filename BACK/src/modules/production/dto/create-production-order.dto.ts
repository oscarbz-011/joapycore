import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateProductionOrderDto {
  @ApiProperty({ description: 'Producto fabricado a producir' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Cantidad a fabricar', example: 5 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Depósito del que sale la materia prima y al que entra lo fabricado',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
