import type { JwtPayload } from '../types/auth';

const REFRESH_KEY = 'refresh_token';

let _accessToken: string | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return _accessToken;
  },
  setAccessToken(token: string | null): void {
    _accessToken = token;
  },
  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  setRefreshToken(token: string | null): void {
    if (typeof window === 'undefined') return;
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  },
  clear(): void {
    _accessToken = null;
    if (typeof window !== 'undefined') localStorage.removeItem(REFRESH_KEY);
  },
};

export function decodeJwt(token: string): JwtPayload {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64)) as JwtPayload;
}
