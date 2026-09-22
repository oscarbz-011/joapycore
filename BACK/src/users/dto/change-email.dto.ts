import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty({ example: 'usuario@empresa.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ description: 'Contraseña actual para confirmar el cambio' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword: string;
}
