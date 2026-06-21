import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Industry } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  tenantName: string;

  @ApiProperty({ enum: Industry })
  @IsEnum(Industry)
  industry: Industry;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ description: 'Approximate number of employees (used for plan sizing)', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  employeeCount?: number;
}
