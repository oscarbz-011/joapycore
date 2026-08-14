import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum CollectionNoteTypeDto {
  VISIT = 'VISIT',
  CALL = 'CALL',
  MESSAGE = 'MESSAGE',
  GENERAL = 'GENERAL',
}

export class AddCollectionNoteDto {
  @ApiProperty({ description: 'ID del cliente' })
  @IsString()
  customerId: string;

  @ApiProperty({ description: 'Contenido de la nota' })
  @IsString()
  note: string;

  @ApiPropertyOptional({ enum: CollectionNoteTypeDto, default: CollectionNoteTypeDto.GENERAL })
  @IsEnum(CollectionNoteTypeDto)
  @IsOptional()
  type?: CollectionNoteTypeDto;
}
