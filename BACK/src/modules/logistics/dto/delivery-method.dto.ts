import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SetDeliveryMethodDto {
  @ApiProperty({
    enum: ['HOME_DELIVERY', 'PICKUP'],
    description:
      'Envío a domicilio o retiro en sucursal. "A cargo del vendedor" no se elige acá: lo pide el vendedor y lo autoriza un supervisor',
  })
  @IsIn(['HOME_DELIVERY', 'PICKUP'])
  method: 'HOME_DELIVERY' | 'PICKUP';
}

export class RequestSellerDeliveryDto {
  @ApiPropertyOptional({ description: 'Por qué lo lleva el vendedor' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class DecideSellerDeliveryDto {
  @ApiPropertyOptional({
    description: 'Comentario del supervisor; obligatorio al rechazar',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class SellerDeliveredDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  // Opcionales hoy: quedan para cuando el vendedor también confirme la
  // ubicación de la entrega.
  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
