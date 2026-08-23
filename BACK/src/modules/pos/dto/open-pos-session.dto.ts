import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class OpenPosSessionDto {
  @ApiProperty()
  @IsUUID()
  terminalId!: string;

  @ApiProperty({ description: 'Monto de efectivo con el que se abre la caja' })
  @IsNumber()
  @Min(0)
  openingCash!: number;
}
