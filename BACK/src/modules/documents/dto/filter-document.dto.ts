import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class FilterDocumentDto {
  @ApiPropertyOptional({ enum: DocType })
  @IsOptional()
  @IsEnum(DocType)
  type?: DocType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Filtrar documentos que vencen en N días' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  expiringSoonDays?: number;

  @ApiPropertyOptional({ description: 'Buscar por título, descripción o categoría' })
  @IsOptional()
  @IsString()
  search?: string;
}
