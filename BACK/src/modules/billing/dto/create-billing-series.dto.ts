import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingDocumentType, BillingModality } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const MAX_DOCUMENT_NUMBER = 9_999_999;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBillingSeriesDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional({
    enum: BillingDocumentType,
    default: BillingDocumentType.INVOICE,
  })
  @IsOptional()
  @IsEnum(BillingDocumentType)
  documentType?: BillingDocumentType;

  @ApiProperty({ enum: BillingModality })
  @IsEnum(BillingModality)
  modality!: BillingModality;

  @ApiProperty({ example: '12345678' })
  @Matches(/^\d{8}$/, { message: 'El timbrado tiene 8 dígitos' })
  timbrado!: string;

  @ApiProperty({ example: '2026-01-01' })
  @Matches(CALENDAR_DATE, { message: 'validFrom debe ser AAAA-MM-DD' })
  validFrom!: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Obligatoria salvo en la facturación electrónica',
  })
  @IsOptional()
  @Matches(CALENDAR_DATE, { message: 'validUntil debe ser AAAA-MM-DD' })
  validUntil?: string;

  @ApiProperty({ example: '001' })
  @Matches(/^\d{3}$/, { message: 'El establecimiento tiene 3 dígitos' })
  establecimiento!: string;

  @ApiProperty({ example: '001' })
  @Matches(/^\d{3}$/, { message: 'El punto de expedición tiene 3 dígitos' })
  puntoExpedicion!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  rangeFrom!: number;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  rangeTo!: number;

  @ApiPropertyOptional({
    description:
      'Próximo número a usar; por defecto, el inicio del rango. Sirve para continuar un talonario ya empezado.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  nextNumber?: number;
}
