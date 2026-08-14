import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SifenEnvironment } from '@prisma/client';

export class UpdateSifenSettingsDto {
  @ApiProperty({ enum: SifenEnvironment, example: 'TESTING' })
  @IsEnum(SifenEnvironment)
  environment!: SifenEnvironment;
}
