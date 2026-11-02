import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransportType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_DOCUMENT_NUMBER } from './create-billing-series.dto';

const MAX_ITEMS = 200;
const MAX_SERIALS = 500;

/** Dirección con ciudad y departamento (art. 33, incisos 2 y 3). */
export class RemissionAddressDto {
  @ApiProperty({ example: 'Avda. Mcal. López 1234' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  address!: string;

  @ApiProperty({ example: 'Asunción' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiProperty({ example: 'Capital' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  department!: string;
}

/** Vehículo, transportista, conductor y fechas (art. 33, incisos 4 y 9). */
export class RemissionTransportDto {
  @ApiProperty({ enum: TransportType })
  @IsEnum(TransportType)
  type!: TransportType;

  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  vehicleBrand!: string;

  @ApiProperty({ example: 'AAAA123', description: 'Chapa o número de RUA' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  vehiclePlate!: string;

  @ApiPropertyOptional({ description: 'Chapa del remolque o semirremolque' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  trailerPlate?: string;

  @ApiProperty({ example: 'Transportes del Sur S.A.' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  carrierName!: string;

  @ApiProperty({ example: '80012345-6' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  carrierRuc!: string;

  @ApiProperty({ description: 'Domicilio fiscal del transportista' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  carrierAddress!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  driverName!: string;

  @ApiProperty({ example: '1234567', description: 'Cédula del conductor' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  driverDocument!: string;

  @ApiProperty({ description: 'Dirección del conductor' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  driverAddress!: string;

  @ApiProperty({ example: '2026-11-03', description: 'Inicio del traslado' })
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiProperty({ example: '2026-11-03', description: 'Fin del traslado' })
  @IsISO8601({ strict: true })
  endDate!: string;
}

class RemissionIssueBaseDto {
  @ApiProperty({ type: RemissionAddressDto })
  @ValidateNested()
  @Type(() => RemissionAddressDto)
  origin!: RemissionAddressDto;

  @ApiProperty({ type: RemissionAddressDto })
  @ValidateNested()
  @Type(() => RemissionAddressDto)
  destination!: RemissionAddressDto;

  @ApiProperty({ type: RemissionTransportDto })
  @ValidateNested()
  @Type(() => RemissionTransportDto)
  transport!: RemissionTransportDto;

  @ApiPropertyOptional({ description: 'Serie de notas de remisión elegida' })
  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @ApiPropertyOptional({ description: 'Número de la hoja del talonario' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  documentNumber?: number;

  @ApiPropertyOptional({
    example: 'Mercadería frágil',
    description: 'Observaciones: cadena de frío, carga peligrosa, pesos…',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class TransferLineDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SERIALS)
  @IsString({ each: true })
  serialNumbers?: string[];
}

/** Traslado de mercadería entre depósitos de la empresa. */
export class IssueTransferRemissionDto extends RemissionIssueBaseDto {
  @ApiProperty()
  @IsUUID()
  fromWarehouseId!: string;

  @ApiProperty()
  @IsUUID()
  toWarehouseId!: string;

  @ApiProperty({ type: [TransferLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  items!: TransferLineDto[];
}

export class SaleRemissionLineDto {
  @ApiProperty()
  @IsUUID()
  invoiceItemId!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SERIALS)
  @IsString({ each: true })
  serialNumbers?: string[];
}

/** Envío de mercadería vendida con su factura. */
export class IssueSaleRemissionDto extends RemissionIssueBaseDto {
  @ApiProperty({ example: 'María Pérez' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  recipientName!: string;

  @ApiProperty({ example: '1234567', description: 'RUC o cédula' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  recipientDocument!: string;

  @ApiProperty({ type: [SaleRemissionLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => SaleRemissionLineDto)
  items!: SaleRemissionLineDto[];
}

export class VoidRemissionDto {
  @ApiProperty({ example: 'El camión no salió' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}
