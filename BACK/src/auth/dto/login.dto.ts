import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Email or username' })
  @IsString()
  emailOrUsername: string;

  @ApiProperty()
  @IsString()
  password: string;
}
