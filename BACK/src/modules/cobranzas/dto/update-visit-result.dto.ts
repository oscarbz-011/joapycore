import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export enum PaymentMethodDto {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  MOBILE = 'MOBILE',
  OTHER = 'OTHER',
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

  @ApiPropertyOptional({ enum: PaymentMethodDto })
  @IsEnum(PaymentMethodDto)
  @IsOptional()
  paymentMethod?: PaymentMethodDto;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({ description: 'Fecha de compromiso (solo para PROMISE)' })
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  promiseDate?: Date;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
