import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertChannel, AlertType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export class UpsertAlertDto {
  @ApiProperty({ enum: AlertType })
  @IsEnum(AlertType)
  type: AlertType;

  @ApiPropertyOptional({ enum: AlertChannel })
  @IsOptional()
  @IsEnum(AlertChannel)
  channel?: AlertChannel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'STOCK_LOW: unidades mínimas; PAYMENT_DUE / INVOICE_OVERDUE: días',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  threshold?: number;
}
