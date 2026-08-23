import { registerAs } from '@nestjs/config';

export interface EmailConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export default registerAs(
  'email',
  (): EmailConfig => ({
    host: process.env['SMTP_HOST'],
    port: Number(process.env['SMTP_PORT'] ?? 587),
    secure: process.env['SMTP_SECURE'] === 'true',
    user: process.env['SMTP_USER'],
    password: process.env['SMTP_PASSWORD'],
    from: process.env['SMTP_FROM'] ?? 'no-reply@joapycore.local',
  }),
);
