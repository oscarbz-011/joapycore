import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeCount } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ActividadEconomicaDto {
  @ApiPropertyOptional({ description: 'Código de actividad económica SET' })
  @IsInt()
  codigo: number;

  @ApiPropertyOptional({ description: 'Descripción de la actividad' })
  @IsString()
  descripcion: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Nombre comercial / fantasia' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ description: 'Razón social legal' })
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @ApiPropertyOptional({ description: 'Nombre de fantasía (para SIFEN d006)' })
  @IsOptional()
  @IsString()
  nombreFantasia?: string;

  @ApiPropertyOptional({ description: 'RUC de la empresa' })
  @IsOptional()
  @IsString()
  ruc?: string;

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
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ default: 'Paraguay' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'URL del logo (subido via /files)' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ enum: EmployeeCount, description: 'Rango aproximado de empleados' })
  @IsOptional()
  @IsEnum(EmployeeCount)
  employeeCount?: EmployeeCount;

  @ApiPropertyOptional({ description: 'Moneda base', default: 'PYG' })
  @IsOptional()
  @IsString()
  currency?: string;

  // ── SIFEN — datos fiscales ────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Número de timbrado otorgado por SET' })
  @IsOptional()
  @IsString()
  timbradoNumero?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio de vigencia del timbrado (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  timbradoFecha?: string;

  @ApiPropertyOptional({ description: '1 = Persona Física, 2 = Persona Jurídica' })
  @IsOptional()
  @IsInt()
  @Min(1)
  tipoContribuyente?: number;

  @ApiPropertyOptional({ description: '8 = IVA General, 1 = Simplificado, etc.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  tipoRegimen?: number;

  @ApiPropertyOptional({ type: [ActividadEconomicaDto], description: 'Actividades económicas declaradas ante SET' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActividadEconomicaDto)
  actividadesEconomicas?: ActividadEconomicaDto[];

  // ── SIFEN — dirección estructurada (códigos SET) ──────────────────────────

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
