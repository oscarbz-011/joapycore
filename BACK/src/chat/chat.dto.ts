import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StrictValidation } from '../common/pipes/app-validation.pipe';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

@StrictValidation()
export class OpenConversationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  participantIds!: string[];

  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[^\r\n]*$/)
  name?: string;
}

@StrictValidation()
export class SendMessageDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

@StrictValidation()
export class MessagesQueryDto {
  @IsOptional()
  @IsISO8601()
  before?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
