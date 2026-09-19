import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateIncomingEmailIntegrationDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: 'imap.example.com' })
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(255)
  host: string;

  @ApiProperty({ example: 993 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiProperty({
    description: 'Usar TLS directo, normalmente en el puerto 993',
  })
  @IsBoolean()
  secure: boolean;

  @ApiProperty({ example: 'usuario@empresa.com' })
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  @MaxLength(320)
  user: string;

  @ApiPropertyOptional({
    description: 'Omitir para conservar la contraseña guardada',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  password?: string;
}
