'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from './api/auth';
import { decodeJwt, tokenStore } from './token-store';
import type { JwtPayload, RegisterDto, User } from '../types/auth';

const MCP_KEY = 'mcp'; // mustChangePassword sessionStorage key

interface AuthState {
  user: User | null;
  jwtPayload: JwtPayload | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
}

interface AuthContextValue extends AuthState {
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
  clearMustChangePassword: () => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    jwtPayload: null,
    isLoading: true,
    isAuthenticated: false,
    mustChangePassword: false,
  });
  const router = useRouter();

  useEffect(() => {
    const storedRefresh = tokenStore.getRefreshToken();
    if (!storedRefresh) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    authApi
      .refresh(storedRefresh)
      .then((data) => {
        tokenStore.setAccessToken(data.accessToken);
        tokenStore.setRefreshToken(data.refreshToken);
        const mustChangePassword =
          typeof window !== 'undefined' &&
          sessionStorage.getItem(MCP_KEY) === '1';
        setState({
          user: data.user,
          jwtPayload: decodeJwt(data.accessToken),
          isLoading: false,
          isAuthenticated: true,
          mustChangePassword,
        });
      })
      .catch(() => {
        tokenStore.clear();
        setState({ user: null, jwtPayload: null, isLoading: false, isAuthenticated: false, mustChangePassword: false });
      });
  }, []);

  const login = useCallback(
    async (emailOrUsername: string, password: string) => {
      const data = await authApi.login({ emailOrUsername, password });
      tokenStore.setAccessToken(data.accessToken);
      tokenStore.setRefreshToken(data.refreshToken);
      const mustChangePassword = !!data.mustChangePassword;
      if (mustChangePassword) sessionStorage.setItem(MCP_KEY, '1');
      else sessionStorage.removeItem(MCP_KEY);
      setState({
        user: data.user,
        jwtPayload: decodeJwt(data.accessToken),
        isLoading: false,
        isAuthenticated: true,
        mustChangePassword,
      });
      router.push('/dashboard');
    },
    [router],
  );

  const register = useCallback(
    async (dto: RegisterDto) => {
      const data = await authApi.register(dto);
      tokenStore.setAccessToken(data.accessToken);
      tokenStore.setRefreshToken(data.refreshToken);
      sessionStorage.removeItem(MCP_KEY);
      setState({
        user: data.user,
        jwtPayload: decodeJwt(data.accessToken),
        isLoading: false,
        isAuthenticated: true,
        mustChangePassword: false,
      });
      router.push('/dashboard');
    },
    [router],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch {
        // best-effort revocation
      }
    }
    tokenStore.clear();
    sessionStorage.removeItem(MCP_KEY);
    setState({ user: null, jwtPayload: null, isLoading: false, isAuthenticated: false, mustChangePassword: false });
    router.push('/login');
  }, [router]);

  const clearMustChangePassword = useCallback(() => {
    sessionStorage.removeItem(MCP_KEY);
    setState((s) => ({ ...s, mustChangePassword: false }));
  }, []);

  const refreshSession = useCallback(async () => {
    const storedRefresh = tokenStore.getRefreshToken();
    if (!storedRefresh) return;
    const data = await authApi.refresh(storedRefresh);
    tokenStore.setAccessToken(data.accessToken);
    tokenStore.setRefreshToken(data.refreshToken);
    setState((s) => ({
      ...s,
      user: data.user,
      jwtPayload: decodeJwt(data.accessToken),
    }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, clearMustChangePassword, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
