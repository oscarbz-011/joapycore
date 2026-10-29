import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateBillingSeriesDto } from './create-billing-series.dto';

export class UpdateBillingSeriesDto extends PartialType(
  CreateBillingSeriesDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
