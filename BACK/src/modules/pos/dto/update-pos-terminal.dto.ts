import { ApiPropertyOptional } from '@nestjs/swagger';
import { PosPrintFormat } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePosTerminalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Serie de facturas de la sucursal de la caja; null la quita',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  invoiceSeriesId?: string | null;

  @ApiPropertyOptional({ enum: PosPrintFormat })
  @IsOptional()
  @IsEnum(PosPrintFormat)
  printFormat?: PosPrintFormat;

  @ApiPropertyOptional({
    description: 'Informe de durabilidad del papel térmico (archivo subido)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  thermalPaperReportFileId?: string | null;

  @ApiPropertyOptional({
    description: 'Condiciones de conservación que se imprimen en la factura',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(300)
  thermalPaperConservation?: string | null;
}
