import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocType, DocVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({ enum: DocType })
  @IsEnum(DocType)
  type!: DocType;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Etiqueta de categoría libre (ej. "Contratos vigentes")' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ enum: DocVisibility, default: DocVisibility.PRIVATE })
  @IsEnum(DocVisibility)
  visibility!: DocVisibility;

  @ApiPropertyOptional({
    type: [String],
    description: 'Requerido cuando visibility = ROLE_BASED',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedRoles?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  fileSizeBytes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Tipo de entidad vinculada (ej. "customer", "saleOrder")' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'ID de la entidad vinculada' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Fecha ISO de vencimiento del documento' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Contenido del documento (TipTap JSON serializado)' })
  @IsOptional()
  @IsString()
  content?: string;
}
