import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class FilterCatalogDto {
  @ApiPropertyOptional({
    description: 'Busca por descripción o código del proveedor',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Solo ítems sin producto interno asignado',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  unmapped?: boolean;

  @ApiPropertyOptional({
    description: 'Excluye los ítems con vigencia vencida',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  onlyValid?: boolean;
}
