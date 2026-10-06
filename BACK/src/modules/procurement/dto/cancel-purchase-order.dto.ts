import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelPurchaseOrderDto {
  @ApiProperty({ description: 'Por qué se cancela; queda en el historial' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3, { message: 'Indicá el motivo de la cancelación' })
  @MaxLength(500)
  reason: string;
}
