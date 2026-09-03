import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { DocumentType, EconomicActivity } from '@prisma/client';

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

  @ApiPropertyOptional({ enum: EconomicActivity })
  @IsOptional()
  @IsEnum(EconomicActivity)
  economicActivity?: EconomicActivity;

  @ApiPropertyOptional({ description: 'Cuenta con seguro IPS' })
  @IsOptional()
  @IsBoolean()
  hasIpsInsurance?: boolean;

  // Datos laborales
  @ApiPropertyOptional({ description: 'Empresa donde trabaja' })
  @IsOptional()
  @IsString()
  employerName?: string;

  @ApiPropertyOptional({ description: 'Jefe/Supervisor' })
  @IsOptional()
  @IsString()
  supervisorName?: string;

  @ApiPropertyOptional({ description: 'Teléfono laboral' })
  @IsOptional()
  @IsString()
  workPhone?: string;

  @ApiPropertyOptional({ description: 'Dirección laboral' })
  @IsOptional()
  @IsString()
  workAddress?: string;

  @ApiPropertyOptional({ description: 'Antigüedad laboral' })
  @IsOptional()
  @IsString()
  workSeniority?: string;

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

  // Coordenadas de la dirección de entrega — usadas por Logística para
  // ubicar al cliente en el mapa antes de la 1ª entrega. Ver
  // schema.prisma:Customer para la nota sobre por qué esto es solo la
  // "mejor estimación": DeliveryTrackingEvent sigue siendo la fuente de
  // verdad de qué pasó en una entrega puntual, esto solo fija el pin
  // inicial/default.
  @ApiPropertyOptional({ description: 'Latitud de la dirección de entrega' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitud de la dirección de entrega' })
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
