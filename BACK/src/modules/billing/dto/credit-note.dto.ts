import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditNoteKind, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_DOCUMENT_NUMBER } from './create-billing-series.dto';

export const SETTLEMENT_MODES = ['CUSTOMER_CREDIT', 'REFUND'] as const;
export type SettlementMode = (typeof SETTLEMENT_MODES)[number];

/** Qué hacer con la plata que el cliente ya pagó y deja de deber. */
export class SettlementDto {
  @ApiProperty({ enum: SETTLEMENT_MODES })
  @IsIn(SETTLEMENT_MODES)
  mode!: SettlementMode;

  @ApiPropertyOptional({ enum: PaymentMethod, description: 'Solo al devolver' })
  @ValidateIf((dto: SettlementDto) => dto.mode === 'REFUND')
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Transferencia 00123' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}

export class CreditNoteItemDto {
  @ApiProperty()
  @IsUUID()
  invoiceItemId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class RestockLineDto {
  @ApiProperty()
  @IsUUID()
  invoiceItemId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'N/S de los serializados',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  serialNumbers?: string[];
}

export class IssueCreditNoteDto {
  @ApiProperty({ enum: CreditNoteKind })
  @IsEnum(CreditNoteKind)
  kind!: CreditNoteKind;

  @ApiProperty({ example: 'El cliente devolvió una unidad' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({
    type: [CreditNoteItemDto],
    description: 'Solo por ítems',
  })
  @ValidateIf((dto: IssueCreditNoteDto) => dto.kind === CreditNoteKind.ITEMS)
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreditNoteItemDto)
  items?: CreditNoteItemDto[];

  @ApiPropertyOptional({ example: 110000, description: 'Solo por importe' })
  @ValidateIf((dto: IssueCreditNoteDto) => dto.kind === CreditNoteKind.AMOUNT)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ enum: [0, 5, 10], description: 'Solo por importe' })
  @IsOptional()
  @IsIn([0, 5, 10])
  ivaRate?: number;

  @ApiPropertyOptional({
    type: [RestockLineDto],
    description: 'Lo que vuelve al stock',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RestockLineDto)
  restock?: RestockLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @ApiPropertyOptional({ description: 'Número de la hoja del talonario' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  documentNumber?: number;

  @ApiPropertyOptional({ type: SettlementDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettlementDto)
  excess?: SettlementDto;
}

export class VoidInvoiceDto {
  @ApiProperty({ example: 'Se cargó al cliente equivocado' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({
    type: SettlementDto,
    description: 'Obligatorio si la factura ya estaba cobrada',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SettlementDto)
  settlement?: SettlementDto;
}
