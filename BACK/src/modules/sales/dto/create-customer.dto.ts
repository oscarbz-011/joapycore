import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondFirstName?: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondLastName?: string;

  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  monthlyIncome?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // Structured delivery address — Casa
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeStreet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeNeighborhood?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeReference?: string;

  // Structured delivery address — Departamento / Apto
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aptBuilding?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aptFloor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aptNumber?: string;
}
