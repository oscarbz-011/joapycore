import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, Max, Min, ValidateNested } from 'class-validator';

const MAX_MM = 500;

export class FormPointDto {
  @ApiProperty({ description: 'mm desde el borde izquierdo' })
  @IsNumber()
  @Min(0)
  @Max(MAX_MM)
  x!: number;

  @ApiProperty({ description: 'mm desde el borde superior' })
  @IsNumber()
  @Min(0)
  @Max(MAX_MM)
  y!: number;
}

export class FormItemsDto {
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) top!: number;
  @ApiProperty() @IsNumber() @Min(2) @Max(30) lineHeight!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(60) maxLines!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) quantityX!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) descriptionX!: number;
  @ApiProperty() @IsNumber() @Min(5) @Max(MAX_MM) descriptionWidth!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) unitPriceX!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) exemptX!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) taxed5X!: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) taxed10X!: number;
}

export class PreprintedLayoutDto {
  @ApiProperty() @IsNumber() @Min(50) @Max(MAX_MM) pageWidth!: number;
  @ApiProperty() @IsNumber() @Min(50) @Max(MAX_MM) pageHeight!: number;
  @ApiProperty() @IsNumber() @Min(-30) @Max(30) offsetX!: number;
  @ApiProperty() @IsNumber() @Min(-30) @Max(30) offsetY!: number;
  @ApiProperty() @IsNumber() @Min(6) @Max(16) fontSize!: number;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  date!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  cashMark!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  creditMark!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  buyerName!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  buyerDocument!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  buyerAddress!: FormPointDto;

  @ApiProperty({ type: FormItemsDto })
  @ValidateNested()
  @Type(() => FormItemsDto)
  items!: FormItemsDto;

  @ApiProperty() @IsNumber() @Min(0) @Max(MAX_MM) subtotalsY!: number;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  total!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  totalInWords!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  iva5!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  iva10!: FormPointDto;

  @ApiProperty({ type: FormPointDto })
  @ValidateNested()
  @Type(() => FormPointDto)
  ivaTotal!: FormPointDto;
}
