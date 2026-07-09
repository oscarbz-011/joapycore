import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeCount } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  tenantName: string;

  @ApiPropertyOptional({
    description: 'Rubro de la empresa (texto libre). Ej: electrodomesticos, ferreteria, supermercado',
    example: 'electrodomesticos',
  })
  @IsOptional()
  @IsString()
  industry?: string;

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

  @ApiPropertyOptional({ description: 'Si no se provee, se auto-genera desde nombre y apellido' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.]+$/, { message: 'username solo puede tener minúsculas, números, puntos y guiones bajos' })
  username?: string;

  @ApiPropertyOptional({ enum: EmployeeCount, description: 'Rango aproximado de empleados' })
  @IsOptional()
  @IsEnum(EmployeeCount)
  employeeCount?: EmployeeCount;
}
