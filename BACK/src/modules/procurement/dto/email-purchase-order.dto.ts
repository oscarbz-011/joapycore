import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class EmailPurchaseOrderDto {
  @ApiPropertyOptional({
    description: 'Dirección de destino. Si se omite, el email del proveedor',
  })
  @IsOptional()
  @IsEmail({}, { message: 'La dirección de email no es válida' })
  to?: string;
}
