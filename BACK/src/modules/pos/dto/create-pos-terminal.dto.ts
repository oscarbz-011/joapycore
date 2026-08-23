import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePosTerminalDto {
  @ApiProperty({ description: 'Sucursal a la que pertenece la caja' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ example: 'Caja 1' })
  @IsString()
  @MinLength(1)
  name: string;
}
