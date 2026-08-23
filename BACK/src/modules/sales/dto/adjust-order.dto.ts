import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleOrderItemDto } from './create-sale-order.dto';

export class AdjustOrderDto {
  @ApiPropertyOptional({
    type: [SaleOrderItemDto],
    description:
      'Reemplaza por completo los ítems del pedido. Omitir para dejar los ítems como están.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleOrderItemDto)
  items?: SaleOrderItemDto[];

  @ApiPropertyOptional({
    description:
      'Nuevo número de cuotas. Omitir para dejar el plan de financiación como está.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number;
}
