import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { MarkupType, ProductKind, ProductStatus } from '@prisma/client';

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  costPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  salePrice?: number;

  // El paso a ACTIVE valida que la ficha esté completa (ver
  // ProductsService.assertActivatable) — no es un simple set del campo.
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  // Cambiar el tipo NO recalcula isPurchasable/isSellable: si el usuario ya
  // los ajustó a mano, pisarlos sería perder su decisión. Para volver a los
  // defaults del tipo se mandan los flags explícitos.
  @ApiPropertyOptional({ enum: ProductKind })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPurchasable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSellable?: boolean;

  @ApiPropertyOptional({
    description:
      'Gestiona el stock separado por lotes (fecha de ingreso, costo, vencimiento)',
  })
  @IsOptional()
  @IsBoolean()
  usesLots?: boolean;

  @ApiPropertyOptional({ description: 'Peso en kilogramos' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weightKg?: number | null;

  @ApiPropertyOptional({ description: 'Alto en centímetros' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  heightCm?: number | null;

  @ApiPropertyOptional({ description: 'Ancho en centímetros' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  widthCm?: number | null;

  @ApiPropertyOptional({ description: 'Profundidad en centímetros' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  depthCm?: number | null;

  @ApiPropertyOptional({
    description: 'Margen adicional sobre el margen global',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  additionalMarkup?: number | null;

  @ApiPropertyOptional({ enum: MarkupType })
  @IsOptional()
  @IsEnum(MarkupType)
  additionalMarkupType?: MarkupType | null;
}
