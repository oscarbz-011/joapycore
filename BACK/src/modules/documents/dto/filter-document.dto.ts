import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocType, TemplateKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class FilterDocumentDto {
  @ApiPropertyOptional({ enum: DocType })
  @IsOptional()
  @IsEnum(DocType)
  type?: DocType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Filtrar solo plantillas (true) o solo documentos normales (false)',
  })
  @IsOptional()
  // @Type(() => Boolean) coacciona con el constructor Boolean() — Boolean('false') da true.
  // Se interpreta el string de la query manualmente en su lugar.
  @Transform(({ value }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  isTemplate?: boolean;

  @ApiPropertyOptional({ enum: TemplateKind })
  @IsOptional()
  @IsEnum(TemplateKind)
  templateKind?: TemplateKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar documentos que vencen en N días',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  expiringSoonDays?: number;

  @ApiPropertyOptional({
    description: 'Buscar por título, descripción o categoría',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
