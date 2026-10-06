import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SupplierInvoiceLineDto {
  @ApiProperty({ description: 'Línea de la recepción que se factura' })
  @IsUUID()
  purchaseReceiptItemId: string;

  @ApiProperty({ description: 'Cantidad facturada (0 = no la facturó)' })
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiProperty({ description: 'Precio unitario facturado' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost: number;
}

export class CreateSupplierInvoiceDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({
    description:
      'Cuentas por pagar (una por recepción) que cubre la factura: una sola entrega o varias',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  payableIds: string[];

  @ApiProperty({ example: '001-001-0001234' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  invoiceNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  timbrado?: string;

  @ApiProperty({ example: '2026-10-07' })
  @IsDateString()
  invoiceDate: string;

  @ApiPropertyOptional({ description: 'Envío cobrado en la factura' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  shippingAmount?: number;

  @ApiPropertyOptional({ description: 'Descuento aplicado en la factura' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({ type: [SupplierInvoiceLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceLineDto)
  lines: SupplierInvoiceLineDto[];
}

export class ApproveSupplierInvoiceDto {
  @ApiPropertyOptional({ description: 'Por qué se acepta la diferencia' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectSupplierInvoiceDto {
  @ApiProperty({ description: 'Qué se le reclama al proveedor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
