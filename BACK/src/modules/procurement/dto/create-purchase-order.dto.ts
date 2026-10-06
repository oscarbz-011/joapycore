import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseType } from '@prisma/client';

export class PurchaseOrderItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  unitCost: number;

  @ApiPropertyOptional({
    description:
      'Ítem del catálogo del proveedor del que sale la línea. Tiene que estar vinculado a productId',
  })
  @IsOptional()
  @IsUUID()
  catalogItemId?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ enum: PurchaseType })
  @IsEnum(PurchaseType)
  purchaseType: PurchaseType;

  @ApiProperty()
  @IsDateString()
  orderDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional({
    description: 'Tipo de cambio (solo para importaciones)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  exchangeRate?: number;

  @ApiPropertyOptional({ description: 'Porcentaje de arancel aduanero' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  customsDuty?: number;

  @ApiPropertyOptional({ description: 'Referencia de despacho aduanero' })
  @IsOptional()
  @IsString()
  customsRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Anticipo que pide esta orden antes de despachar. Si se omite, el porcentaje habitual del proveedor',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  advanceAmount?: number;

  @ApiProperty({ type: [PurchaseOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}
