import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierAvailability } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class PriceTierDto {
  @ApiProperty({ description: 'Cantidad desde la que rige el precio' })
  @IsInt()
  @Min(2)
  minQuantity: number;

  @ApiProperty({ description: 'Precio por unidad del proveedor' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;
}

// La vigencia es un día de calendario, no un instante: se manda como
// YYYY-MM-DD y se guarda como medianoche UTC de ese día.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DAY_MESSAGE = 'La fecha tiene que tener el formato AAAA-MM-DD';

export class CatalogValidityDto {
  @ApiPropertyOptional({
    description: 'Primer día en que rige el precio (AAAA-MM-DD)',
    nullable: true,
  })
  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  validFrom?: string | null;

  @ApiPropertyOptional({
    description: 'Último día en que rige el precio (AAAA-MM-DD)',
    nullable: true,
  })
  @IsOptional()
  @Matches(ISO_DAY, { message: ISO_DAY_MESSAGE })
  validTo?: string | null;
}

export class UpdateCatalogItemDto extends CatalogValidityDto {
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

  @ApiPropertyOptional({
    description: 'Código de barras o del fabricante; null lo borra',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  barcode?: string | null;

  @ApiPropertyOptional({
    description: 'Cantidad mínima que vende el proveedor; null la borra',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  minOrderQuantity?: number | null;

  @ApiPropertyOptional({
    enum: SupplierAvailability,
    description: 'Disponibilidad informada por el proveedor; null la borra',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(SupplierAvailability)
  availability?: SupplierAvailability | null;

  @ApiPropertyOptional({
    type: [PriceTierDto],
    description: 'Precios por cantidad; un arreglo vacío los quita',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PriceTierDto)
  priceTiers?: PriceTierDto[];
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
