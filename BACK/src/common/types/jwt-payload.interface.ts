export interface JwtPayload {
  sub: string;
  tenantId: string;
  tenantName: string;
  email: string;
  roles: string[];
  permissions: string[];
  activeModules: string[];
}
