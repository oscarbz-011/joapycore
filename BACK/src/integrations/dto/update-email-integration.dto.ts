import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateEmailIntegrationDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 'smtp.example.com' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host: string;

  @ApiProperty({ example: 587 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({
    description: 'Usar TLS directo, normalmente en el puerto 465',
  })
  @IsBoolean()
  secure: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  user?: string;

  @ApiPropertyOptional({
    description: 'Omitir para conservar la contraseña guardada',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  password?: string;

  @ApiProperty({ example: 'ventas@empresa.com' })
  @IsEmail()
  @MaxLength(320)
  fromEmail: string;

  @ApiPropertyOptional({ example: 'Mi Empresa' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string;
}
