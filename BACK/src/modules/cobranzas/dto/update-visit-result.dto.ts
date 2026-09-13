import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum VisitResultDto {
  COLLECTED = 'COLLECTED',
  PARTIAL = 'PARTIAL',
  ABSENT = 'ABSENT',
  REFUSED = 'REFUSED',
  PROMISE = 'PROMISE',
}

export class UpdateVisitResultDto {
  @ApiProperty({ enum: VisitResultDto })
  @IsEnum(VisitResultDto)
  result: VisitResultDto;

  @ApiPropertyOptional({ description: 'Monto cobrado efectivamente' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  collectedAmount?: number;

  // Enum de la base: el DTO propio aceptaba MOBILE/OTHER, que Prisma rechaza
  // al guardar (500), y no permitía tarjeta ni las bocas de cobranza.
  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({
    description: 'Fecha de compromiso (solo para PROMISE)',
  })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  promiseDate?: Date;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
