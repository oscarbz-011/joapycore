import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CatalogSearchDto {
  @ApiProperty({
    description:
      'Lo que se busca: palabras de la descripción, un código de barras o el código del proveedor',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  query: string;

  @ApiProperty({
    description: 'Proveedores en cuyos catálogos buscar, separados por coma',
    type: String,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? [
          ...new Set(
            value
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        ]
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  supplierIds: string[];
}
