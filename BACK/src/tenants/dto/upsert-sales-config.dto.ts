import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpsertSalesConfigDto {
  @ApiProperty()
  @IsBoolean()
  combosEnabled: boolean;
}
