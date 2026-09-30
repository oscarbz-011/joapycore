import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { corsOrigin } from './config/security.config';
import { AppValidationPipe } from './common/pipes/app-validation.pipe';

/**
 * Middlewares y configuración global de la app HTTP. Vive fuera de main.ts
 * para que los tests e2e levanten la app exactamente igual que producción
 * (helmet, CORS, validación, filtro de errores) en vez de una versión a medias.
 */
export function configureApp(app: NestExpressApplication): void {
  const configService = app.get(ConfigService);

  // Detrás de un proxy/load balancer la IP real viene en X-Forwarded-For; sin
  // esto el rate limiting cuenta a todos los clientes como una sola IP.
  const trustProxy = configService.get<string>('TRUST_PROXY');
  if (trustProxy) {
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  // Swagger UI necesita scripts/estilos inline: se le relaja la CSP solo a /docs.
  const apiHelmet = helmet({
    // El front (otro origen) muestra logos y archivos servidos por la API.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  const docsHelmet = helmet({ contentSecurityPolicy: false });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith('/docs')
      ? docsHelmet(req, res, next)
      : apiHelmet(req, res, next),
  );

  app.enableCors({ origin: corsOrigin });
  app.useGlobalPipes(new AppValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
}
