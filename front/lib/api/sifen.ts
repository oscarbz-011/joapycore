import { apiClient } from './client';

export type SifenEnvironment = 'TESTING' | 'PRODUCTION';

export interface SifenConfig {
  environment: SifenEnvironment;
  certFilename: string | null;
  certType: string | null;
  certValidFrom: string | null;
  certValidUntil: string | null;
  certSubject: string | null;
  caCertFilename: string | null;
  isConfigured: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

export interface TestResult {
  ok: boolean;
  testedAt: string;
  message: string;
}

export const sifenApi = {
  getConfig(): Promise<SifenConfig> {
    return apiClient.get('/sifen/config').then((r) => r.data);
  },

  updateSettings(environment: SifenEnvironment): Promise<SifenConfig> {
    return apiClient.patch('/sifen/config/settings', { environment }).then((r) => r.data);
  },

  uploadCertificate(file: File, password?: string): Promise<SifenConfig> {
    const form = new FormData();
    form.append('file', file);
    if (password) form.append('password', password);
    return apiClient
      .post('/sifen/config/certificate', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  removeCertificate(): Promise<SifenConfig> {
    return apiClient.delete('/sifen/config/certificate').then((r) => r.data);
  },

  uploadCaCertificate(file: File): Promise<SifenConfig> {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post('/sifen/config/ca-certificate', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  removeCaCertificate(): Promise<SifenConfig> {
    return apiClient.delete('/sifen/config/ca-certificate').then((r) => r.data);
  },

  testConnection(): Promise<TestResult> {
    return apiClient.post('/sifen/config/test').then((r) => r.data);
  },
};
