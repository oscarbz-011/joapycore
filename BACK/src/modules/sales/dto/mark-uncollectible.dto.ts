import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class MarkUncollectibleDto {
  @ApiProperty({
    description: 'Motivo por el que el cliente pasa a incobrable/judicial',
    example: 'Deuda derivada a gestión judicial',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
