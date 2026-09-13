import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CancelInvoiceDto {
  @ApiProperty({
    description:
      'Motivo de la cancelación (requerido para generar nota de crédito)',
  })
  @IsString()
  @MinLength(5)
  reason: string;
}
