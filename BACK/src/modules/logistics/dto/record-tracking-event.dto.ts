import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryCheckpoint } from '@prisma/client';
import { IsBoolean, IsEnum, IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class RecordTrackingEventDto {
  @ApiPropertyOptional({ enum: DeliveryCheckpoint })
  @IsOptional()
  @IsEnum(DeliveryCheckpoint)
  checkpoint?: DeliveryCheckpoint;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'true = la ubicación registrada era correcta; false = se corrigió',
  })
  @IsOptional()
  @IsBoolean()
  locationConfirmed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
