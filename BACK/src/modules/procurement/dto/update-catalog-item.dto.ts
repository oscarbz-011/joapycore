import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Unidad en la que vende el proveedor' })
  @IsOptional()
  @IsString()
  supplierUnit?: string;

  @ApiPropertyOptional({
    description: 'Cuántas unidades internas equivale una unidad del proveedor',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  conversionFactor?: number;
}

export class MapCatalogItemDto {
  // null desvincula: un ítem mal mapeado tiene que poder volver a "suelto"
  // sin borrarlo y perder su precio y su historial de importación.
  @ApiPropertyOptional({
    description: 'Producto interno al que se vincula. null lo desvincula',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  productId?: string | null;
}
