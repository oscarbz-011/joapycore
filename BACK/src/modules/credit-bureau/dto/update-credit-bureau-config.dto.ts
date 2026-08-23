import { ApiProperty } from '@nestjs/swagger';
import { CreditBureauCheckFrequency } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

export class UpdateCreditBureauConfigDto {
  @ApiProperty({
    description:
      'Habilitar o deshabilitar la integración con el buró de crédito',
  })
  @IsBoolean()
  isEnabled: boolean;

  @ApiProperty({
    enum: CreditBureauCheckFrequency,
    description:
      'Cuándo pedir una verificación: solo en la primera compra a crédito, o en cada solicitud',
  })
  @IsEnum(CreditBureauCheckFrequency)
  checkFrequency: CreditBureauCheckFrequency;
}
