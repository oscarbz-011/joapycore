import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { StrictValidation } from '../common/pipes/app-validation.pipe';

export const NOTE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type NotePriority = (typeof NOTE_PRIORITIES)[number];
export const NOTE_VIEWS = ['all', 'starred', 'trash'] as const;
export type NoteView = (typeof NOTE_VIEWS)[number];

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

@StrictValidation()
export class NoteDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[^\r\n]*$/)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsIn(NOTE_PRIORITIES)
  priority?: NotePriority;

  @IsOptional()
  @IsBoolean()
  starred?: boolean;
}

@StrictValidation()
export class UpdateNoteDto extends PartialType(NoteDto) {}

@StrictValidation()
export class NotesQueryDto {
  @IsOptional()
  @IsIn(NOTE_VIEWS)
  view: NoteView = 'all';
}
