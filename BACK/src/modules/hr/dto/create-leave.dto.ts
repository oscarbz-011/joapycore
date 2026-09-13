import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LeaveStatus, LeaveType } from '@prisma/client';

export class CreateLeaveDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiProperty({ enum: LeaveType }) @IsEnum(LeaveType) type: LeaveType;
  @ApiProperty({ example: '2026-10-05' }) @IsDateString() startDate: string;
  @ApiProperty({ example: '2026-10-16' }) @IsDateString() endDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class FilterLeavesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;

  @ApiPropertyOptional({ enum: LeaveStatus })
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class RejectLeaveDto {
  @ApiPropertyOptional({ description: 'Motivo del rechazo' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class LeaveBalanceQueryDto {
  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

export class UpsertLeaveBalanceDto {
  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ description: 'Días hábiles de vacaciones del año' })
  @IsInt()
  @Min(0)
  @Max(365)
  entitled: number;
}
