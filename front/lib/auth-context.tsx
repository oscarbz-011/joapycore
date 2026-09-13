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
import { refreshSessionTokens } from './api/session-refresh';
import { usersApi } from './api/users';
import { decodeJwt, tokenStore } from './token-store';
import type { JwtPayload, RegisterDto, User } from '../types/auth';

const MCP_KEY = 'mcp'; // mustChangePassword sessionStorage key
// Limpieza de la clave que versiones anteriores dejaban en sessionStorage
// con la contraseña temporal en texto plano.
const LEGACY_TMP_PW_KEY = 'tmp_pw';

// La contraseña temporal solo vive en memoria, para precompletar el cambio
// obligatorio justo después del login. Nunca en storage: cualquier script
// inyectado podría leerla. Si se recarga la página, el usuario la tipea.
let pendingTempPassword: string | null = null;

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
  /** Contraseña temporal del último login, si sigue en memoria. */
  getPendingTempPassword: () => string | null;
  /**
   * Cambia la contraseña y vuelve a autenticar con la nueva: el backend cierra
   * todas las sesiones emitidas con la anterior, incluida esta.
   */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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

    refreshSessionTokens()
      .then((data) => {
        const mustChangePassword =
          typeof window !== 'undefined' &&
          sessionStorage.getItem(MCP_KEY) === '1';
        setState((current) => {
          // Don't override state already set by an explicit login/register call
          if (current.isAuthenticated && !current.isLoading) return current;
          return {
            user: data.user,
            jwtPayload: decodeJwt(data.accessToken),
            isLoading: false,
            isAuthenticated: true,
            mustChangePassword,
          };
        });
      })
      .catch(() => {
        setState((current) => {
          // Don't clear tokens if the user already logged in manually in the meantime
          if (current.isAuthenticated) return { ...current, isLoading: false };
          tokenStore.clear();
          return { user: null, jwtPayload: null, isLoading: false, isAuthenticated: false, mustChangePassword: false };
        });
      });
  }, []);

  const login = useCallback(
    async (emailOrUsername: string, password: string) => {
      const data = await authApi.login({ emailOrUsername, password });
      tokenStore.setAccessToken(data.accessToken);
      tokenStore.setRefreshToken(data.refreshToken);
      const mustChangePassword = !!data.mustChangePassword;
      sessionStorage.removeItem(LEGACY_TMP_PW_KEY);
      if (mustChangePassword) {
        sessionStorage.setItem(MCP_KEY, '1');
        pendingTempPassword = password;
      } else {
        sessionStorage.removeItem(MCP_KEY);
        pendingTempPassword = null;
      }
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
    sessionStorage.removeItem(LEGACY_TMP_PW_KEY);
    pendingTempPassword = null;
    setState({ user: null, jwtPayload: null, isLoading: false, isAuthenticated: false, mustChangePassword: false });
    router.push('/login');
  }, [router]);

  const clearMustChangePassword = useCallback(() => {
    sessionStorage.removeItem(MCP_KEY);
    sessionStorage.removeItem(LEGACY_TMP_PW_KEY);
    pendingTempPassword = null;
    setState((s) => ({ ...s, mustChangePassword: false }));
  }, []);

  const refreshSession = useCallback(async () => {
    const storedRefresh = tokenStore.getRefreshToken();
    if (!storedRefresh) return;
    const data = await refreshSessionTokens();
    setState((s) => ({
      ...s,
      user: data.user,
      jwtPayload: decodeJwt(data.accessToken),
    }));
  }, []);

  const getPendingTempPassword = useCallback(() => pendingTempPassword, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const email = state.user?.email;
      await usersApi.changePassword({ currentPassword, newPassword });
      if (!email) return;
      const data = await authApi.login({ emailOrUsername: email, password: newPassword });
      tokenStore.setAccessToken(data.accessToken);
      tokenStore.setRefreshToken(data.refreshToken);
      sessionStorage.removeItem(MCP_KEY);
      sessionStorage.removeItem(LEGACY_TMP_PW_KEY);
      pendingTempPassword = null;
      setState((s) => ({
        ...s,
        user: data.user,
        jwtPayload: decodeJwt(data.accessToken),
        mustChangePassword: false,
      }));
    },
    [state.user?.email],
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        clearMustChangePassword,
        refreshSession,
        getPendingTempPassword,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
