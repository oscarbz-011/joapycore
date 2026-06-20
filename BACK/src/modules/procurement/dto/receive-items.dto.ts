import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ReceivedItemDto {
  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'N/S para productos serializados',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class ReceiveItemsDto {
  @ApiProperty({ type: [ReceivedItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivedItemDto)
  items: ReceivedItemDto[];
}
