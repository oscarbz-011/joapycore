import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { StrictValidation } from '../common/pipes/app-validation.pipe';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

@StrictValidation()
export class CalendarEventDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[^\r\n]*$/)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  @Matches(/^[^\r\n]*$/)
  location?: string | null;

  @IsBoolean()
  allDay!: boolean;

  /** UTC. Con allDay, la medianoche UTC del día de calendario. */
  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @IsBoolean()
  companyWide!: boolean;
}

@StrictValidation()
export class UpdateCalendarEventDto extends PartialType(CalendarEventDto) {}

@StrictValidation()
export class CalendarRangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}
