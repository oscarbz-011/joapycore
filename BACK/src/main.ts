import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { corsOrigin, isSwaggerEnabled } from './config/security.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  if (isSwaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('JoapyCore API')
      .setDescription(
        'API del ERP SaaS JoapyCore. Multi-tenant, modular. ' +
          'Autenticarse con **POST /auth/login** y usar el token en el botón **Authorize**.',
      )
      .setVersion('1.0')
      .addServer('http://localhost:3000', 'Local')
      .addBearerAuth()
      // Core
      .addTag('Auth', 'Registro, login, refresh y logout')
      .addTag(
        'Tenants',
        'Datos de la empresa, módulos activos y configuración (crédito, precios, ventas)',
      )
      .addTag('Users', 'Gestión de usuarios')
      .addTag('Roles', 'Roles y catálogo de permisos')
      .addTag('Branches', 'Sucursales del tenant')
      .addTag('Warehouses', 'Depósitos de inventario')
      // Catálogo y compras
      .addTag(
        'Inventory',
        'Categorías, marcas, productos, lotes, stock y movimientos',
      )
      .addTag(
        'Procurement',
        'Proveedores, órdenes de compra, recepciones y cuentas por pagar',
      )
      // Ventas y crédito
      .addTag('Sales', 'Clientes, órdenes de venta, combos y metas')
      .addTag(
        'Credit Bureau',
        'Integración con buró de crédito para evaluación de clientes',
      )
      // Facturación y cobros
      .addTag('Billing', 'Facturas')
      .addTag('Payments', 'Pagos y cuentas por cobrar (contado)')
      .addTag('Finance', 'Préstamos, cuotas y pagos a crédito')
      .addTag('Collections', 'Rutas de cobranza, visitas y acuerdos de pago')
      // Logística y punto de venta
      .addTag(
        'Logistics',
        'Notas de entrega, asignación de repartidores y seguimiento',
      )
      .addTag('POS', 'Terminales, sesiones y ventas de punto de venta')
      // Personal
      .addTag('HR', 'Empleados, áreas, cargos, licencias y nómina')
      // Documentos y reportes
      .addTag(
        'Documents',
        'Plantillas, categorías y documentos generados (contratos, recibos)',
      )
      .addTag('Reports', 'Reportes de ventas, stock y cuentas por cobrar')
      .addTag('Alerts', 'Configuración de alertas automáticas')
      .addTag(
        'SIFEN',
        'Facturación electrónica (Paraguay) — certificado y configuración',
      )
      // Transversal
      .addTag('Audit', 'Registro de auditoría')
      .addTag('Files', 'Subida y gestión de archivos')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<string>('PORT') ?? 3000;
  const host = configService.get<string>('HOST') ?? '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
