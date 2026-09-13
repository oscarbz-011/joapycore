import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class SendDocumentEmailDto {
  @ApiPropertyOptional({
    description:
      'Email destino. Si se omite, se usa el email del cliente vinculado al documento.',
  })
  @IsOptional()
  @IsEmail()
  to?: string;
}
