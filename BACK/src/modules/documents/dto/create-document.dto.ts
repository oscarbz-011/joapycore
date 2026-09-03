import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DocContentFormat,
  DocType,
  DocVisibility,
  TemplateKind,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
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

  @ApiPropertyOptional({ description: 'ID de la categoría (DocumentCategory)' })
  @IsOptional()
  @IsString()
  categoryId?: string;

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

  @ApiPropertyOptional({
    description: 'Tipo de entidad vinculada (ej. "customer", "sale_order")',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ description: 'ID de la entidad vinculada' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Fecha ISO de vencimiento del documento',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description:
      'Contenido del documento (TipTap JSON serializado, o HTML crudo según contentFormat)',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    enum: DocContentFormat,
    default: DocContentFormat.TIPTAP,
  })
  @IsOptional()
  @IsEnum(DocContentFormat)
  contentFormat?: DocContentFormat;

  @ApiPropertyOptional({
    description: 'Marca este documento como una plantilla reutilizable',
  })
  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({
    enum: TemplateKind,
    description: 'Requerido cuando isTemplate = true',
  })
  @IsOptional()
  @IsEnum(TemplateKind)
  templateKind?: TemplateKind;

  @ApiPropertyOptional({
    description:
      'Si ya existe una plantilla activa para el templateKind elegido, desactivarla (quitarle el uso automático) en vez de rechazar con 409',
  })
  @IsOptional()
  @IsBoolean()
  replaceActiveTemplate?: boolean;
}
