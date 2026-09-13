import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollectionNoteType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AddCollectionNoteDto {
  @ApiProperty({ description: 'ID del cliente' })
  @IsString()
  customerId: string;

  @ApiProperty({ description: 'Contenido de la nota' })
  @IsString()
  note: string;

  @ApiPropertyOptional({
    enum: CollectionNoteType,
    default: CollectionNoteType.GENERAL,
  })
  @IsEnum(CollectionNoteType)
  @IsOptional()
  type?: CollectionNoteType;
}
