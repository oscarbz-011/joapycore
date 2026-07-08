import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectCreditDto {
  @ApiProperty({ description: 'Motivo del rechazo del crédito' })
  @IsString()
  @MinLength(5)
  reason: string;
}
