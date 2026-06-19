import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, MinLength } from 'class-validator';

export class AddProductUnitsDto {
  @ApiProperty({ type: [String], description: 'Lista de números de serie a ingresar' })
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  serialNumbers: string[];
}
