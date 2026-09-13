import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({
    description: 'Módulo dueño del archivo (ej. hr, sales, documents)',
    default: 'general',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  module?: string;

  @ApiPropertyOptional({
    description: 'Tipo de entidad a la que se adjunta (ej. employee, invoice)',
    default: 'generic',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  entityType?: string;

  @ApiPropertyOptional({ description: 'ID de la entidad a la que se adjunta' })
  @IsOptional()
  @IsString()
  entityId?: string;
}
