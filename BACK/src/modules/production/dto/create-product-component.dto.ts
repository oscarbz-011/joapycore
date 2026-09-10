import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateProductComponentDto {
  @ApiProperty({ description: 'Producto que se consume (materia prima o insumo)' })
  @IsUUID()
  componentId: string;

  // Decimal: una receta puede llevar 0,5 litros de barniz o 2,25 m de tela.
  @ApiProperty({
    description: 'Cantidad consumida por unidad producida',
    example: 2.5,
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
