import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeCount, Industry } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ enum: EmployeeCount, description: 'Rango aproximado de empleados' })
  @IsOptional()
  @IsEnum(EmployeeCount)
  employeeCount?: EmployeeCount;
}
