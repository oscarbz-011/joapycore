import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, ValidateIf } from 'class-validator';

export class SetExpectedDateDto {
  @ApiProperty({
    description:
      'Entrega estimada (AAAA-MM-DD), o null para dejarla "a convenir". Dato de control interno: no figura en el PDF de la orden',
    example: '2026-10-20',
    nullable: true,
  })
  @ValidateIf((dto: SetExpectedDateDto) => dto.expectedDate !== null)
  @IsDateString()
  expectedDate: string | null;
}
