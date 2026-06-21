export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
  mustChangePassword?: boolean;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  tenantName: string;
  email: string;
  roles: string[];
  permissions: string[];
  activeModules: string[];
  iat: number;
  exp: number;
}

export interface RegisterDto {
  tenantName: string;
  industry: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  employeeCount: 'RANGE_1_5' | 'RANGE_6_20' | 'RANGE_21_50' | 'RANGE_51_200' | 'RANGE_201';
}

export interface LoginDto {
  emailOrUsername: string;
  password: string;
}
