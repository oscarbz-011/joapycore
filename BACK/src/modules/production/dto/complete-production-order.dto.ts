import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductionConsumptionDto {
  @ApiPropertyOptional({ description: 'Componente consumido' })
  @IsUUID()
  componentId: string;

  // Puede ser 0: a veces un componente planificado no se terminó usando.
  @ApiPropertyOptional({ description: 'Cantidad realmente consumida' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  usedQuantity: number;
}

export class CompleteProductionOrderDto {
  // En el taller casi nunca sale exacto: si no se manda nada, se consume lo
  // planificado; si se manda, se registra el consumo real de esos componentes.
  @ApiPropertyOptional({
    type: [ProductionConsumptionDto],
    description:
      'Consumo real por componente. Si se omite, se usa lo planificado',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionConsumptionDto)
  consumptions?: ProductionConsumptionDto[];
}
