import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  issuedBeforeCutoff,
  SessionStateCache,
} from '../services/session-state.cache';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly sessionState: SessionStateCache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // La firma del token prueba quién es; el estado vigente (activo, empresa
  // activa, permisos actuales) sale de la base con caché corto.
  async validate(payload: JwtPayload & { iat?: number }): Promise<JwtPayload> {
    const state = await this.sessionState.get(payload.sub);
    if (!state || !state.userActive) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }
    if (!state.tenantActive) {
      throw new UnauthorizedException('La empresa está suspendida');
    }
    if (issuedBeforeCutoff(payload.iat, state.sessionsValidAfter)) {
      throw new UnauthorizedException(
        'La sesión fue cerrada. Iniciá sesión de nuevo.',
      );
    }
    return { ...payload, roles: state.roles, permissions: state.permissions };
  }
}
