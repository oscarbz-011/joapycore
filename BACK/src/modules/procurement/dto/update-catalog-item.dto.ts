import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

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
