import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { MarkupType, OrderChannel, ProductKind } from '@prisma/client';

export class CreateProductDto {
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

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  isSerialized: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Gestiona el stock separado por lotes (fecha de ingreso, costo, vencimiento)',
  })
  @IsOptional()
  @IsBoolean()
  usesLots?: boolean;

  @ApiPropertyOptional({ default: 'unidad' })
  @IsOptional()
  @IsString()
  unit?: string;

  // Si se omite, se deriva del rubro del tenant (una mueblería crea productos
  // fabricados por defecto, el resto de reventa) — ver
  // defaultKindForIndustry().
  @ApiPropertyOptional({
    enum: ProductKind,
    description:
      'Naturaleza del producto. Si se omite, se deriva del rubro del tenant',
  })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  // Si se omiten, se derivan del `kind`. Se mandan explícitos solo para los
  // casos mixtos.
  @ApiPropertyOptional({
    description: 'Participa en órdenes de compra. Default según el tipo',
  })
  @IsOptional()
  @IsBoolean()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ enum: OrderChannel, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(OrderChannel, { each: true })
  salesChannels?: OrderChannel[];

  // Opcionales a propósito: la ficha del producto se puede crear incompleta
  // (queda en DRAFT) para no frenar la carga de catálogo. Los precios se
  // exigen recién al activarlo — ver ProductsService.assertActivatable.
  @ApiPropertyOptional({
    description:
      'Omitir si todavía no se conoce — el producto queda en DRAFT hasta tenerlo',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  costPrice?: number;

  @ApiPropertyOptional({
    description:
      'Omitir si todavía no se conoce — el producto queda en DRAFT hasta tenerlo',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  salePrice?: number;

  @ApiPropertyOptional({
    description: 'Margen adicional sobre el margen global',
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  additionalMarkup?: number;

  @ApiPropertyOptional({ enum: MarkupType })
  @IsOptional()
  @IsEnum(MarkupType)
  additionalMarkupType?: MarkupType;
}
