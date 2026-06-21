import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeCount } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'RUC de la empresa' })
  @IsOptional()
  @IsString()
  ruc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

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
}
