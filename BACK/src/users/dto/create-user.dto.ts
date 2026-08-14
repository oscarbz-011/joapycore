import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({
    description: 'Si no se provee, se auto-genera desde nombre y apellido',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.]+$/, {
    message:
      'username solo puede tener minúsculas, números, puntos y guiones bajos',
  })
  username?: string;
}
