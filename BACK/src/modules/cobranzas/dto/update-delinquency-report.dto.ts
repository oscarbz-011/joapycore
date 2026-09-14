import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateDelinquencyReportDto {
  @ApiProperty({
    enum: ['REPORTED', 'EXCLUDED'],
    description:
      'REPORTED = confirmado y reportado a Informconf (manual, fuera del sistema); EXCLUDED = el analista decide no reportarlo',
  })
  @IsEnum(['REPORTED', 'EXCLUDED'])
  status: 'REPORTED' | 'EXCLUDED';

  @ApiPropertyOptional({
    description: 'N° de referencia/expediente del reporte a Informconf',
  })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
