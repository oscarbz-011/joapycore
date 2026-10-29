import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { MAX_DOCUMENT_NUMBER } from './create-billing-series.dto';

export class VoidInvoiceSheetDto {
  @ApiProperty({ example: 'Se trabó el papel en la impresora' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Hoja en la que se vuelve a imprimir; por defecto, la siguiente sugerida',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  documentNumber?: number;

  @ApiPropertyOptional({ description: 'Escaneo o foto de la hoja inutilizada' })
  @IsOptional()
  @IsUUID()
  scanFileId?: string;
}

export class VoidLooseSheetDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  documentNumber!: number;

  @ApiProperty({ example: 'Hoja extraviada' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional({ description: 'Escaneo o foto de la hoja inutilizada' })
  @IsOptional()
  @IsUUID()
  scanFileId?: string;
}

export class PhysicalScanDto {
  @ApiProperty({
    nullable: true,
    description: 'Escaneo o foto de la factura física; null lo quita',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  fileId!: string | null;
}
