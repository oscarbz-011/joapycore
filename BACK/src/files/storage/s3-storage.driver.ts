import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../../config/storage.config';
import type { StorageDriver, StorageObject, StoragePutOptions } from './storage.interface';

// Sirve indistintamente AWS S3, MinIO, Cloudflare R2 y cualquier backend
// S3-compatible — la diferencia entre ellos es pura configuración
// (S3_ENDPOINT + S3_FORCE_PATH_STYLE), no código.
@Injectable()
export class S3StorageDriver implements StorageDriver {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(configService: ConfigService) {
    const s3Config = configService.get<StorageConfig['s3']>('storage.s3');
    this.bucket = s3Config?.bucket ?? '';
    this.client = new S3Client({
      region: s3Config?.region ?? 'us-east-1',
      endpoint: s3Config?.endpoint,
      forcePathStyle: s3Config?.forcePathStyle ?? false,
      credentials:
        s3Config?.accessKey && s3Config?.secretKey
          ? { accessKeyId: s3Config.accessKey, secretAccessKey: s3Config.secretKey }
          : undefined,
    });
  }

  async put(key: string, data: Buffer, options?: StoragePutOptions): Promise<StorageObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: options?.contentType,
      }),
    );
    return { key, size: data.length, contentType: options?.contentType };
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
