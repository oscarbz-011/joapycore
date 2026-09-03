import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmptyObject, IsObject } from 'class-validator';

export class GenerateDocumentDto {
  @ApiProperty({
    description:
      'Valores por variable detectada en la plantilla DOCX (clave = variable, ej. "cliente.nombre")',
    type: Object,
    example: { 'cliente.nombre': 'Juan Pérez' },
  })
  @IsObject()
  @IsNotEmptyObject()
  values!: Record<string, string>;
}
