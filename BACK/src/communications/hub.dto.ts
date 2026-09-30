import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { StrictValidation } from '../common/pipes/app-validation.pipe';

@StrictValidation()
export class CommunicationSettingsDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  emailEnabled?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  invoiceEmailEnabled?: boolean;
}

@StrictValidation()
export class CommunicationIdentityDto {
  @IsIn(['SYSTEM', 'SHARED'])
  type!: 'SYSTEM' | 'SHARED';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[^\r\n]*$/)
  name?: string;

  @IsEmail()
  @MaxLength(254)
  fromEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[^\r\n]*$/)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  replyTo?: string | null;

  @IsBoolean()
  outboundEnabled!: boolean;

  @IsBoolean()
  isDefault!: boolean;
}

@StrictValidation()
export class UpdateCommunicationIdentityDto extends PartialType(
  CommunicationIdentityDto,
) {}

@StrictValidation()
export class CommunicationTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[^\r\n]+$/)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  bodyText!: string;
}

@StrictValidation()
export class CommunicationPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class CommunicationMessagesQueryDto extends CommunicationPageDto {
  @IsOptional()
  @IsIn(['QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'UNKNOWN'])
  status?: 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'UNKNOWN';
}

@StrictValidation()
export class CommunicationNoteDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
