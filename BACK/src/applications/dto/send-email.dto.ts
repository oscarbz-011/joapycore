import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SendApplicationEmailDto {
  @ApiProperty({ example: 'cliente@example.com' })
  @IsEmail()
  @MaxLength(320)
  to: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  body: string;
}
