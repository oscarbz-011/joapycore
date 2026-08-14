import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TenantModuleGuard } from './common/guards/tenant-module.guard';
import { AlertsModule } from './modules/alerts/alerts.module';
import { BillingModule } from './modules/billing/billing.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CobranzasModule } from './modules/cobranzas/cobranzas.module';
import { SifenModule } from './modules/sifen/sifen.module';
import { FinanceModule } from './modules/finance/finance.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { HrModule } from './modules/hr/hr.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { ReportsModule } from './modules/reports/reports.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { SalesModule } from './modules/sales/sales.module';
import { FilesModule } from './files/files.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    AuditModule,
    InventoryModule,
    ProcurementModule,
    SalesModule,
    LogisticsModule,
    DocumentsModule,
    BillingModule,
    FinanceModule,
    CobranzasModule,
    PaymentsModule,
    BranchesModule,
    WarehousesModule,
    HrModule,
    AlertsModule,
    ReportsModule,
    FilesModule,
    NotificationsModule,
    SifenModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: TenantModuleGuard },
  ],
})
export class AppModule {}
