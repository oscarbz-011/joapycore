import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpsertCreditConfigDto {
  @ApiProperty({ description: 'Habilitar o deshabilitar ventas a crédito para este tenant' })
  @IsBoolean()
  isEnabled: boolean;
}
