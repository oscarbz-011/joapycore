import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { OrderChannel, ProductKind, ProductStatus } from '@prisma/client';

export class FilterProductDto {
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
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isSerialized?: boolean;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ enum: ProductKind })
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  // Filtros por flujo — los usan los selectores de producto para no ofrecer lo
  // que después el backend va a rechazar.
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isPurchasable?: boolean;

  @ApiPropertyOptional({ enum: OrderChannel })
  @IsOptional()
  @IsEnum(OrderChannel)
  salesChannel?: OrderChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
