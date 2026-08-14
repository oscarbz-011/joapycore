import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import { SifenRepository } from '../repositories/sifen.repository';
import { UpdateSifenSettingsDto } from '../dto/update-sifen-settings.dto';

const ALLOWED_CERT_TYPES = ['p12', 'pfx', 'cer', 'crt'];
const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;

function getEncryptionKey(): Buffer {
  const raw = process.env['SIFEN_ENCRYPTION_KEY'] ?? '';
  if (!raw) {
    // Derive a key from APP_SECRET as fallback (not ideal for production)
    const secret = process.env['JWT_SECRET'] ?? 'fallback-dev-key-change-in-prod';
    return crypto.createHash('sha256').update(secret).digest();
  }
  return Buffer.from(raw, 'hex').subarray(0, KEY_LEN);
}

function encrypt(data: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [iv(12)] + [tag(16)] + [ciphertext]
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(blob: Buffer): Buffer {
  const key = getEncryptionKey();
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ciphertext = blob.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encryptString(text: string): string {
  return encrypt(Buffer.from(text, 'utf-8')).toString('base64');
}

function decryptString(b64: string): string {
  return decrypt(Buffer.from(b64, 'base64')).toString('utf-8');
}

@Injectable()
export class SifenService {
  constructor(private readonly sifenRepository: SifenRepository) {}

  async getConfig(tenantId: string) {
    const cfg = await this.sifenRepository.findByTenant(tenantId);
    if (!cfg) {
      return {
        environment: 'TESTING' as const,
        certFilename: null,
        certType: null,
        certValidFrom: null,
        certValidUntil: null,
        certSubject: null,
        caCertFilename: null,
        isConfigured: false,
        lastTestedAt: null,
        lastTestOk: null,
      };
    }
    return {
      environment: cfg.environment,
      certFilename: cfg.certFilename,
      certType: cfg.certType,
      certValidFrom: cfg.certValidFrom,
      certValidUntil: cfg.certValidUntil,
      certSubject: cfg.certSubject,
      caCertFilename: cfg.caCertFilename,
      isConfigured: cfg.isConfigured,
      lastTestedAt: cfg.lastTestedAt,
      lastTestOk: cfg.lastTestOk,
    };
  }

  async updateSettings(tenantId: string, dto: UpdateSifenSettingsDto) {
    await this.sifenRepository.upsert(tenantId, { environment: dto.environment });
    return this.getConfig(tenantId);
  }

  async uploadCertificate(
    tenantId: string,
    file: Express.Multer.File,
    password: string | undefined,
  ) {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_CERT_TYPES.includes(ext)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido. Use: ${ALLOWED_CERT_TYPES.join(', ')}`,
      );
    }

    const encryptedData = encrypt(file.buffer);
    const encryptedPassword = password ? encryptString(password) : null;

    await this.sifenRepository.upsert(tenantId, {
      certFilename: file.originalname,
      certData: encryptedData,
      certPassword: encryptedPassword,
      certType: ext,
      isConfigured: true,
    });

    return this.getConfig(tenantId);
  }

  async removeCertificate(tenantId: string) {
    const cfg = await this.sifenRepository.findByTenant(tenantId);
    if (!cfg) throw new NotFoundException('Configuración SIFEN no encontrada');

    await this.sifenRepository.upsert(tenantId, {
      certFilename: null,
      certData: null,
      certPassword: null,
      certType: null,
      certValidFrom: null,
      certValidUntil: null,
      certSubject: null,
      isConfigured: !!cfg.caCertFilename,
    });

    return this.getConfig(tenantId);
  }

  async uploadCaCertificate(tenantId: string, file: Express.Multer.File) {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!['cer', 'crt', 'pem'].includes(ext)) {
      throw new BadRequestException('Use un archivo .cer, .crt o .pem para el certificado CA');
    }

    const encryptedData = encrypt(file.buffer);

    await this.sifenRepository.upsert(tenantId, {
      caCertFilename: file.originalname,
      caCertData: encryptedData,
    });

    return this.getConfig(tenantId);
  }

  async removeCaCertificate(tenantId: string) {
    await this.sifenRepository.upsert(tenantId, {
      caCertFilename: null,
      caCertData: null,
    });
    return this.getConfig(tenantId);
  }

  async downloadCertificate(tenantId: string) {
    const cfg = await this.sifenRepository.findByTenant(tenantId);
    if (!cfg?.certData) throw new NotFoundException('No hay certificado cargado');
    return {
      filename: cfg.certFilename ?? 'certificado',
      data: decrypt(cfg.certData as Buffer),
      mimeType: 'application/x-pkcs12',
    };
  }

  async testConnection(tenantId: string) {
    const cfg = await this.sifenRepository.findByTenant(tenantId);
    if (!cfg?.isConfigured) {
      throw new BadRequestException('Configure el certificado antes de probar la conexión');
    }

    // Placeholder — integración real con el web service de SET Paraguay pendiente
    const ok = true;
    const now = new Date();
    await this.sifenRepository.upsert(tenantId, { lastTestedAt: now, lastTestOk: ok });

    return { ok, testedAt: now, message: ok ? 'Conexión exitosa (modo simulación)' : 'Error de conexión' };
  }

  // Internal helper: decrypt certificate password (used by the signing service)
  async getCertPassword(tenantId: string): Promise<string | null> {
    const cfg = await this.sifenRepository.findByTenant(tenantId);
    if (!cfg?.certPassword) return null;
    return decryptString(cfg.certPassword);
  }
}
