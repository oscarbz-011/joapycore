import axios from 'axios';
import { tokenStore } from '../token-store';
import type { AuthTokens } from '../../types/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
type QueueCallback = (token: string) => void;
let refreshQueue: QueueCallback[] = [];

apiClient.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error);
    }
    if (!original) return Promise.reject(error);
    original._retry = true;

    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) return Promise.reject(error);

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          if (original.headers) original.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await axios.post<AuthTokens>(`${API_BASE}/auth/refresh`, {
        refreshToken,
      });
      tokenStore.setAccessToken(data.accessToken);
      tokenStore.setRefreshToken(data.refreshToken);
      refreshQueue.forEach((cb) => cb(data.accessToken));
      refreshQueue = [];
      if (original.headers) original.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(original);
    } catch {
      tokenStore.clear();
      if (typeof window !== 'undefined') window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  },
);
