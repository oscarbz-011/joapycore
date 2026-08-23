import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreditBureauCheckResult } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordBureauCheckDto {
  @ApiProperty() @IsUUID() customerId: string;

  @ApiPropertyOptional({
    description: 'Pedido de venta que originó la consulta, si aplica',
  })
  @IsOptional()
  @IsUUID()
  saleOrderId?: string;

  @ApiProperty({ enum: CreditBureauCheckResult })
  @IsEnum(CreditBureauCheckResult)
  result: CreditBureauCheckResult;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
