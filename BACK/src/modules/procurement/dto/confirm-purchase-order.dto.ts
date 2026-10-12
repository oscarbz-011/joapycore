import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ConfirmPurchaseOrderDto {
  @ApiPropertyOptional({
    description:
      'Fecha de entrega que confirmó el proveedor (AAAA-MM-DD). Dato de control interno: no figura en el PDF de la orden. Si se omite, queda la que ya tenía',
    example: '2026-10-20',
  })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;
}
