import type { Prisma } from '@prisma/client';

/**
 * Tablas de la plataforma (fuera de src/modules): tenants, usuarios y
 * permisos, auditoría, archivos, outbox y las aplicaciones permanentes.
 *
 * Las configs de sub-features de Ventas y Financiamiento (CreditConfig,
 * SalesConfig, PricingConfig, CreditPlan, InterestComponent) están acá porque
 * hoy las administra src/tenants; su dueño natural es el módulo de negocio.
 */
export const PLATFORM_TABLES: Prisma.ModelName[] = [
  'Tenant',
  'TenantModule',
  'TenantIntegration',
  'User',
  'UserPermission',
  'UserRole',
  'Role',
  'Permission',
  'RolePermission',
  'RefreshToken',
  'AuditLog',
  'FileRecord',
  'OutboxEvent',
  'PlatformEmailMessage',
  'AppEmailMessage',
  'AppEmailInboxMessage',
  'ChatConversation',
  'ChatParticipant',
  'ChatMessage',
  'UserNote',
  'CalendarEvent',
  'CommunicationSettings',
  'CommunicationIdentity',
  'CommunicationTemplateVersion',
  'CommunicationMessage',
  'CommunicationDeliveryAttempt',
  'CommunicationNote',
  'CommunicationNotification',
  'CreditConfig',
  'SalesConfig',
  'PricingConfig',
  'CreditPlan',
  'InterestComponent',
];
