import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleTenantModuleDto {
  @ApiProperty()
  @IsBoolean()
  active: boolean;
}
