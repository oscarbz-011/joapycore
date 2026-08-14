import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Número de casa / depto.' })
  @IsOptional()
  @IsString()
  numeroCasa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ── SIFEN — establecimiento ───────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Código de establecimiento ante SET (ej. "001")' })
  @IsOptional()
  @IsString()
  codigoEstablecimiento?: string;

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
