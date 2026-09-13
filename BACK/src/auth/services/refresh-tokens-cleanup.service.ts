import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BUSINESS_TIMEZONE } from '../../common/utils/business-date.util';
import { RefreshTokensRepository } from '../repositories/refresh-tokens.repository';

// Cuánto se conservan los tokens ya inservibles. Los revocados recientes se
// necesitan para detectar reuso (ver AuthService.refresh); pasado este plazo
// solo ocupan espacio.
const RETENTION_DAYS = 30;

/**
 * Cada login y cada renovación crean una fila en refresh_tokens y nada las
 * borraba: la tabla crecía sin límite (2.000+ filas en desarrollo con 37
 * vigentes).
 */
@Injectable()
export class RefreshTokensCleanupService {
  private readonly logger = new Logger(RefreshTokensCleanupService.name);

  constructor(
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: BUSINESS_TIMEZONE })
  async purgeStaleTokens(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.refreshTokensRepository.deleteStale(cutoff);
    if (count > 0) {
      this.logger.log(`Purged ${count} expired/revoked refresh token(s)`);
    }
    return count;
  }
}
