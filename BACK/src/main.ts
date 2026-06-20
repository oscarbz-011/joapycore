import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

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
    .addTag('Tenants', 'Datos de la empresa y módulos activos')
    .addTag('Users', 'Gestión de usuarios y permisos')
    .addTag('Roles', 'Roles y catálogo de permisos')
    // Business modules
    .addTag('Inventory', 'Categorías, marcas, productos y stock')
    .addTag('Procurement', 'Proveedores y órdenes de compra')
    .addTag('Sales', 'Clientes y órdenes de venta')
    .addTag('Billing', 'Facturas')
    .addTag('Payments', 'Pagos y cuentas por cobrar')
    .addTag('HR', 'Empleados, áreas, cargos, licencias y nómina')
    .addTag('Notifications', 'Notificaciones email y WhatsApp')
    .addTag('Audit', 'Registro de auditoría')
    .addTag('Files', 'Subida y gestión de archivos')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();
