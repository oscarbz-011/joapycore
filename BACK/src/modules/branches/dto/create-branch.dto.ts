import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({ example: 'Sucursal Central' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Número de casa / depto.' })
  @IsOptional()
  @IsString()
  numeroCasa?: string;

  @ApiPropertyOptional({ description: 'Ciudad de la sucursal (texto libre)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  // ── SIFEN — establecimiento ───────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Código de establecimiento ante SET (ej. "001")' })
  @IsOptional()
  @IsString()
  codigoEstablecimiento?: string;

  @ApiPropertyOptional({ description: 'Punto de expedición (ej. "001")', default: '001' })
  @IsOptional()
  @IsString()
  puntoExpedicion?: string;

  @ApiPropertyOptional({ description: 'Código de departamento según catálogo SET' })
  @IsOptional()
  @IsInt()
  departamentoCodigo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departamentoDesc?: string;

  @ApiPropertyOptional({ description: 'Código de distrito según catálogo SET' })
  @IsOptional()
  @IsInt()
  distritoCodigo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  distritoDesc?: string;

  @ApiPropertyOptional({ description: 'Código de ciudad según catálogo SET' })
  @IsOptional()
  @IsInt()
  ciudadCodigo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ciudadDesc?: string;
}
