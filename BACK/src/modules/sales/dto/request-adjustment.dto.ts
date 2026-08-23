import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditAdjustmentSuggestion } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RequestAdjustmentDto {
  @ApiProperty({
    enum: CreditAdjustmentSuggestion,
    isArray: true,
    description:
      'Alternativas sugeridas al vendedor para poder aprobar el crédito',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(CreditAdjustmentSuggestion, { each: true })
  suggestedAlternatives: CreditAdjustmentSuggestion[];

  @ApiPropertyOptional({
    description: 'Nota libre del analista para el vendedor',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  note?: string;
}
