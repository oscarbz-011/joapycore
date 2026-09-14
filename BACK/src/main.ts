import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { isSwaggerEnabled } from './config/security.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  configureApp(app);

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
