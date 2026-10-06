import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class AssignUnlocatedStockDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsUUID()
  productId: string;

  @ApiProperty({ description: 'Depósito al que se atribuye la existencia' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Cantidad a asignar. Si se omite se asigna todo el saldo sin depósito',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Series a ubicar (producto serializado). Si se omite se ubican todas',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
