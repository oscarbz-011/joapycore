export interface StoragePutOptions {
  contentType?: string;
}

export interface StorageObject {
  key: string;
  size: number;
  contentType?: string;
}

export interface StorageDriver {
  put(key: string, data: Buffer, options?: StoragePutOptions): Promise<StorageObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** URL para descargar el archivo. Local: la propia ruta del endpoint autenticado. S3: presigned URL de corta duración. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
