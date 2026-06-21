export interface AuditLogEvent {
  tenantId: string;
  userId?: string;
  module: string;
  action: string;
  resourceId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
}
