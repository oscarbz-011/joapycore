import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { PayInstallmentsDto } from './pay-installments.dto';

export class PayCustomerInstallmentsDto extends PayInstallmentsDto {
  @ApiPropertyOptional({
    description:
      'Un recibo por venta en lugar de uno solo con todas las cuotas',
  })
  @IsOptional()
  @IsBoolean()
  separateReceipts?: boolean;
}
