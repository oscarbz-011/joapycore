import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpsertSalesConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  combosEnabled?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'null vuelve a lo que trae el rubro de la empresa',
  })
  @IsOptional()
  @IsBoolean()
  presentationsEnabled?: boolean | null;
}
