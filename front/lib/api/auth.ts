import { apiClient } from './client';
import type { AuthTokens, LoginDto, RegisterDto } from '../../types/auth';

export const authApi = {
  register: (dto: RegisterDto) =>
    apiClient.post<AuthTokens>('/auth/register', dto).then((r) => r.data),

  login: (dto: LoginDto) =>
    apiClient.post<AuthTokens>('/auth/login', dto).then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient.post<AuthTokens>('/auth/refresh', { refreshToken }).then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),
};
