import { registerAs } from '@nestjs/config';

export type StorageDriverName = 'local' | 's3';

export interface StorageConfig {
  driver: StorageDriverName;
  local: {
    root: string;
  };
  s3: {
    endpoint?: string;
    region: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
  };
}

export default registerAs('storage', (): StorageConfig => ({
  driver: (process.env['STORAGE_DRIVER'] as StorageDriverName) ?? 'local',
  local: {
    root: process.env['UPLOADS_DIR'] ?? 'uploads',
  },
  s3: {
    endpoint: process.env['S3_ENDPOINT'],
    region: process.env['S3_REGION'] ?? 'us-east-1',
    bucket: process.env['S3_BUCKET'],
    accessKey: process.env['S3_ACCESS_KEY'],
    secretKey: process.env['S3_SECRET_KEY'],
    forcePathStyle: process.env['S3_FORCE_PATH_STYLE'] === 'true',
  },
}));
