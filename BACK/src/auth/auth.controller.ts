import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo tenant y su usuario Owner',
    description:
      'Crea el tenant, el rol Owner con todos los permisos, el usuario dueño, la sucursal y el depósito principal, y activa los módulos por defecto según el rubro (`industry`). Devuelve tokens de sesión — el usuario queda logueado de inmediato, sin paso de verificación de email.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tenant y usuario creados — devuelve accessToken/refreshToken',
  })
  @ApiResponse({ status: 409, description: 'El email ya está registrado' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Iniciar sesión con email o username',
    description:
      'Devuelve accessToken/refreshToken. Si la contraseña es temporal y ya venció, rechaza el login pidiendo restablecerla.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso — devuelve accessToken/refreshToken',
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas o usuario inactivo',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Renovar el accessToken usando un refreshToken vigente',
    description:
      'El refreshToken usado se revoca y se emite un par nuevo (rotación) — el refreshToken anterior no puede reutilizarse.',
  })
  @ApiResponse({ status: 200, description: 'Tokens renovados' })
  @ApiResponse({
    status: 401,
    description: 'refreshToken inválido, vencido o ya revocado',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión — revoca el refreshToken indicado' })
  @ApiResponse({ status: 204, description: 'Sesión cerrada' })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }
}
