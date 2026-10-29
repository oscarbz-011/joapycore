import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_DOCUMENT_NUMBER } from './create-billing-series.dto';

export class AssignInvoiceNumberDto {
  @ApiPropertyOptional({
    description:
      'Serie a usar; obligatoria si la sucursal tiene más de una vigente',
  })
  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @ApiPropertyOptional({
    description: 'Número del talonario (solo en series de talonario)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_NUMBER)
  documentNumber?: number;
}
