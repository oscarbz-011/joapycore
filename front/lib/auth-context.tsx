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

interface AuthState {
  user: User | null;
  jwtPayload: JwtPayload | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (dto: RegisterDto) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    jwtPayload: null,
    isLoading: true,
    isAuthenticated: false,
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
        setState({
          user: data.user,
          jwtPayload: decodeJwt(data.accessToken),
          isLoading: false,
          isAuthenticated: true,
        });
      })
      .catch(() => {
        tokenStore.clear();
        setState({ user: null, jwtPayload: null, isLoading: false, isAuthenticated: false });
      });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authApi.login({ email, password });
      tokenStore.setAccessToken(data.accessToken);
      tokenStore.setRefreshToken(data.refreshToken);
      setState({
        user: data.user,
        jwtPayload: decodeJwt(data.accessToken),
        isLoading: false,
        isAuthenticated: true,
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
      setState({
        user: data.user,
        jwtPayload: decodeJwt(data.accessToken),
        isLoading: false,
        isAuthenticated: true,
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
    setState({ user: null, jwtPayload: null, isLoading: false, isAuthenticated: false });
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
