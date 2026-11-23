import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RetryFailedProcessDto {
  @ApiPropertyOptional({
    description: 'Proceso del evento que falló; sin él, el evento entero',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  consumer?: string;
}
