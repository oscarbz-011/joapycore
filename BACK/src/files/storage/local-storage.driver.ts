import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StorageConfig } from '../../config/storage.config';
import type {
  StorageDriver,
  StorageObject,
  StoragePutOptions,
} from './storage.interface';

@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(configService: ConfigService) {
    this.root =
      configService.get<StorageConfig['local']>('storage.local')?.root ??
      'uploads';
  }

  private resolve(key: string): string {
    return path.join(this.root, key);
  }

  async put(
    key: string,
    data: Buffer,
    options?: StoragePutOptions,
  ): Promise<StorageObject> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return { key, size: data.length, contentType: options?.contentType };
  }

  get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.resolve(key)).catch(() => undefined);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  // El controller sirve los archivos locales vía stream directo desde
  // GET /files/:id/download — este método existe solo para cumplir la
  // interfaz de forma uniforme con el driver S3, no se usa en ese flujo.
  getSignedUrl(key: string): Promise<string> {
    return Promise.resolve(`/${this.resolve(key).replace(/\\/g, '/')}`);
  }
}
