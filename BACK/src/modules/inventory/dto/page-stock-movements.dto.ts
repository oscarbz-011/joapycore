import { ApiPropertyOptional } from '@nestjs/swagger';
import { MovementReason } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BaseFilterDto } from '../../../common/dto/base-filter.dto';

/**
 * Historial paginado de movimientos de stock. `q` busca por nombre o modelo
 * del producto; `sortBy` acepta: date, product, quantity, reason.
 */
export class PageStockMovementsDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: MovementReason })
  @IsOptional()
  @IsEnum(MovementReason)
  reason?: MovementReason;
}
